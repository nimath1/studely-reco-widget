import { Test, TestingModule } from '@nestjs/testing'
import { APP_GUARD } from '@nestjs/core'
import { Controller, Get, Post, type INestApplication } from '@nestjs/common'
import { ThrottlerGuard, ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler'
import request from 'supertest'
import { buildThrottlers } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'

// Stubs minimalistes : Express route sans tenir compte de la casse
// (caseSensitive: false par défaut) — le test vérifie que le routage des
// quotas fait pareil, sur la config réelle (`buildThrottlers`).
@Controller('admin')
class AdminStubController {
  @Post('sync')
  sync() {
    return { ok: true }
  }
}

@Controller('health')
class HealthStubController {
  @Get()
  check() {
    return { status: 'ok' }
  }
}

@Controller('courses')
class CoursesStubController {
  @Get()
  list() {
    return { items: [] }
  }
}

class InMemoryThrottlerStorage implements ThrottlerStorage {
  private readonly hits = new Map<string, number>()

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<{
    totalHits: number
    timeToExpire: number
    isBlocked: boolean
    timeToBlockExpire: number
  }> {
    const fullKey = `${key}:${throttlerName}`
    const totalHits = (this.hits.get(fullKey) ?? 0) + 1
    this.hits.set(fullKey, totalHits)

    const isBlocked = totalHits > limit
    const timeToExpire = Math.ceil(ttl / 1000)
    const timeToBlockExpire = isBlocked ? Math.ceil(blockDuration / 1000) : 0

    return { totalHits, timeToExpire, isBlocked, timeToBlockExpire }
  }
}

describe('Throttler route matching (e2e)', () => {
  let app: INestApplication

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: buildThrottlers('test-admin-key', 'test-ssr-token'),
          storage: new InMemoryThrottlerStorage()
        })
      ],
      controllers: [AdminStubController, HealthStubController, CoursesStubController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
    }).compile()

    app = module.createNestApplication()
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it('soumet /ADMIN/* au quota admin (10/min), pas au public (100/min)', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/ADMIN/sync')
        .set('x-api-key', 'test-admin-key')
        .expect(201)
    }
    await request(app.getHttpServer())
      .post('/ADMIN/sync')
      .set('x-api-key', 'test-admin-key')
      .expect(429)
  })

  it('identifie /health malgré la query string — hors quota public', async () => {
    for (let i = 0; i < 101; i++) {
      await request(app.getHttpServer()).get('/health?x=1').expect(200)
    }
  })

  it('laisse passer les fetches SSR signés au-delà du quota public', async () => {
    for (let i = 0; i < 101; i++) {
      await request(app.getHttpServer())
        .get('/courses')
        .set('x-internal-ssr', 'test-ssr-token')
        .expect(200)
    }
  })

  it('applique le quota public à un token SSR invalide', async () => {
    for (let i = 0; i < 100; i++) {
      await request(app.getHttpServer())
        .get('/courses')
        .set('x-internal-ssr', 'wrong-token')
        .expect(200)
    }
    await request(app.getHttpServer())
      .get('/courses')
      .set('x-internal-ssr', 'wrong-token')
      .expect(429)
  })
})
