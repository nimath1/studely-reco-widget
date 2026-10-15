import { Controller, Get, Header, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger'
import type { SearchMissAggregate, SearchMissPage } from '@studely/types'
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard'
import { ListSearchMissesDto, SearchMissRangeDto } from './search-misses.dto'
import { SearchMissesService, type PurgeResult } from './search-misses.service'

@ApiTags('admin')
@Controller('admin/search-misses')
@UseGuards(AdminApiKeyGuard)
@ApiSecurity('x-api-key')
export class SearchMissesController {
  constructor(private readonly searchMisses: SearchMissesService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated log of searches without any match' })
  @ApiOkResponse({ description: 'Most recent entries first' })
  list(@Query() query: ListSearchMissesDto): Promise<SearchMissPage> {
    return this.searchMisses.list(query)
  }

  @Get('aggregate')
  @ApiOperation({ summary: 'Searches without match grouped by normalized query' })
  @ApiOkResponse({ description: 'Most frequent queries first' })
  aggregate(@Query() range: SearchMissRangeDto): Promise<SearchMissAggregate[]> {
    return this.searchMisses.aggregate(range)
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="recherches-sans-resultat.csv"')
  @ApiOperation({ summary: 'CSV export (UTF-8 BOM, semicolon) of the grouped searches' })
  @ApiOkResponse({ description: 'CSV file, one line per normalized query' })
  exportCsv(@Query() range: SearchMissRangeDto): Promise<string> {
    return this.searchMisses.exportCsv(range)
  }

  @Post('purge')
  @ApiOperation({ summary: 'Delete entries older than the retention period' })
  @ApiOkResponse({ description: 'Number of deleted entries' })
  purge(): Promise<PurgeResult> {
    return this.searchMisses.purgeExpired()
  }
}
