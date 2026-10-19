import { ExecutionContext, Logger, Module, OnModuleDestroy } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import {
  ThrottlerGuard,
  ThrottlerModule,
  type ThrottlerOptions,
  ThrottlerStorage,
  ThrottlerStorageService
} from '@nestjs/throttler'
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis'
import Redis, { RedisOptions } from 'ioredis'
import { timingSafeEqual } from 'node:crypto'
import { HealthController } from './health/health.controller'
import { CacheModule } from './common/cache/cache.module'

// Express route sans tenir compte de la casse (`/LEADS/demande` atteint le
// contrôleur) et `originalUrl` contient la query (« /health?x=1 ») : le
// routage des quotas compare `req.path` en minuscules — path sans query,
// même insensibilité à la casse que le routeur.
function requestPath(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<{ path?: string; originalUrl?: string }>()
  return (request.path ?? request.originalUrl?.split('?')[0] ?? '').toLowerCase()
}

function routeStartsWith(context: ExecutionContext, prefix: string): boolean {
  const path = requestPath(context)
  return path === prefix || path.startsWith(`${prefix}/`)
}

function isAdminRoute(context: ExecutionContext): boolean {
  return routeStartsWith(context, '/admin')
}

// Les checks de santé (uptime, LB) ne consomment pas le quota public.
function isHealthRoute(context: ExecutionContext): boolean {
  return routeStartsWith(context, '/health')
}

// Comparaison à temps constant, comme AdminApiKeyGuard.
function safeEqual(raw: string, expected: string): boolean {
  const provided = Buffer.from(raw)
  const wanted = Buffer.from(expected)
  return provided.length === wanted.length && timingSafeEqual(provided, wanted)
}

// Le SSR du front appelle l'API depuis l'IP du serveur Nuxt : sans bypass,
// tous les visiteurs partageraient le même bucket de 100 req/min. Le front
// envoie un secret partagé (x-internal-ssr) uniquement côté serveur — jamais
// exposé au navigateur. Le quota /admin reste appliqué même avec le header.
function isInternalSsr(context: ExecutionContext, token: string | undefined): boolean {
  if (!token) return false
  const request = context.switchToHttp().getRequest<{ headers?: Record<string, unknown> }>()
  const raw = request.headers?.['x-internal-ssr']
  const header = Array.isArray(raw) ? raw[0] : raw
  return typeof header === 'string' && safeEqual(header, token)
}

const THROTTLER_REDIS_OPTIONS: RedisOptions = {
  connectTimeout: 1_000,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  // Reconnexion bornée (même backoff que CacheService) : une coupure
  // transitoire ne doit pas laisser le stockage mort jusqu'au restart —
  // FailSafeThrottlerStorage rebascule sur Redis dès qu'il répond.
  retryStrategy: (attempt) => Math.min(attempt * 500, 5_000)
}

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>

// Pendant une coupure Redis, on retombe sur le stockage mémoire du
// throttler : les limites restent appliquées (par process, buckets remis à
// zéro) au lieu d'un fail-open qui désarmerait le rate limiting. Retour à
// Redis après un cooldown — une erreur ne désactive plus pour toute la vie
// du process.
const REDIS_DOWN_COOLDOWN_MS = 30_000

export class FailSafeThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(FailSafeThrottlerStorage.name)
  private readonly fallback = new ThrottlerStorageService()
  private disabledUntil = 0

  constructor(private readonly inner: ThrottlerStorage) {}

  async increment(
    ...args: Parameters<ThrottlerStorage['increment']>
  ): Promise<ThrottlerStorageRecord> {
    if (Date.now() < this.disabledUntil) {
      return this.fallback.increment(...args)
    }

    try {
      return await this.inner.increment(...args)
    } catch (error) {
      this.disabledUntil = Date.now() + REDIS_DOWN_COOLDOWN_MS
      this.logger.warn(error, 'Redis throttler unavailable — in-memory fallback for 30s')
      return this.fallback.increment(...args)
    }
  }

  // Le fallback mémoire arme un timer par hit — à libérer à l'arrêt pour ne
  // pas retarder la sortie du process.
  onApplicationShutdown(): void {
    this.fallback.onApplicationShutdown()
  }
}

interface TrackerRequest {
  ip?: string
  socket?: { remoteAddress?: string }
  headers?: Record<string, string | string[] | undefined>
}

function ipTracker(req: TrackerRequest): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'anonymous'
}

// Tracker admin : une clé valide partage le bucket « admin » (10/min,
// indépendant de l'IP — une seule clé existe, ADMIN_API_KEY) ; une clé
// absente ou invalide partage le bucket IP. Avant, un scryptSync par
// requête offrait un DoS CPU à tout appelant non authentifié, et chaque
// clé aléatoire ouvrait un bucket neuf — la limite ne s'appliquait jamais.
export function adminThrottlerTracker(adminApiKey: string) {
  return (req: TrackerRequest): string => {
    const key = req.headers?.['x-api-key']
    const raw = Array.isArray(key) ? key[0] : key
    return typeof raw === 'string' && raw.length > 0 && safeEqual(raw, adminApiKey)
      ? 'admin'
      : ipTracker(req)
  }
}

let throttlerRedis: Redis | undefined
let throttlerStorage: FailSafeThrottlerStorage | undefined

function createRedisThrottlerStorage(url: string): ThrottlerStorage {
  throttlerRedis = new Redis(url, THROTTLER_REDIS_OPTIONS)
  throttlerRedis.on('error', () => {
    // silencieux : le wrapper FailSafeThrottlerStorage dégrade proprement
  })
  throttlerStorage = new FailSafeThrottlerStorage(new ThrottlerStorageRedisService(throttlerRedis))
  return throttlerStorage
}

// Extraite du `useFactory` pour être testée telle quelle en e2e — la config
// réelle des quotas (routage par path, trackers) est couverte par le spec.
export function buildThrottlers(
  adminApiKey: string,
  internalSsrToken: string | undefined
): ThrottlerOptions[] {
  return [
    {
      // Lecture publique : les fetches SSR (x-internal-ssr) sont exclus
      // pour ne pas mutualiser tous les visiteurs sur l'IP du serveur Nuxt.
      ttl: 60_000,
      limit: 100,
      skipIf: (context) =>
        isAdminRoute(context) || isHealthRoute(context) || isInternalSsr(context, internalSsrToken),
      getTracker: ipTracker
    },
    {
      name: 'admin',
      ttl: 60_000,
      limit: 10,
      skipIf: (context) => !isAdminRoute(context),
      getTracker: adminThrottlerTracker(adminApiKey)
    }
  ]
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const adminApiKey = config.getOrThrow<string>('ADMIN_API_KEY')
        const redisUrl = config.get<string>('REDIS_URL')
        const internalSsrToken = config.get<string>('INTERNAL_API_TOKEN')
        return {
          throttlers: buildThrottlers(adminApiKey, internalSsrToken),
          storage: redisUrl ? createRedisThrottlerStorage(redisUrl) : undefined
        }
      }
    }),
    CacheModule
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    throttlerStorage?.onApplicationShutdown()
    await throttlerRedis?.quit().catch(() => undefined)
  }
}
