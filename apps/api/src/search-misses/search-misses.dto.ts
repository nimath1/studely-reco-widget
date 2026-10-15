import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsISO8601, IsOptional, Matches, Max, Min } from 'class-validator'
import type { SearchMissOutcome, SearchMissSource } from '@studely/types'
import { toOptionalTrimmed, toPositiveInt } from '../common/utils/dto-transforms.util'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const SEARCH_MISS_OUTCOMES: readonly SearchMissOutcome[] = ['no_result', 'out_of_catalog']
export const SEARCH_MISS_SOURCES: readonly SearchMissSource[] = ['catalog', 'assistant']

export class SearchMissRangeDto {
  @ApiPropertyOptional({ description: 'Start date (inclusive), YYYY-MM-DD' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'from must be a YYYY-MM-DD date' })
  @IsISO8601({ strict: true }, { message: 'from must be a valid date' })
  @Transform(({ value }) => toOptionalTrimmed(value))
  from?: string

  @ApiPropertyOptional({ description: 'End date (inclusive), YYYY-MM-DD' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'to must be a YYYY-MM-DD date' })
  @IsISO8601({ strict: true }, { message: 'to must be a valid date' })
  @Transform(({ value }) => toOptionalTrimmed(value))
  to?: string
}

export class ListSearchMissesDto extends SearchMissRangeDto {
  @ApiPropertyOptional({ enum: SEARCH_MISS_OUTCOMES, description: 'Outcome filter' })
  @IsOptional()
  @IsIn(SEARCH_MISS_OUTCOMES)
  @Transform(({ value }) => toOptionalTrimmed(value))
  outcome?: SearchMissOutcome

  @ApiPropertyOptional({ enum: SEARCH_MISS_SOURCES, description: 'Source filter' })
  @IsOptional()
  @IsIn(SEARCH_MISS_SOURCES)
  @Transform(({ value }) => toOptionalTrimmed(value))
  source?: SearchMissSource

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => toPositiveInt(value, 1))
  page = 1

  @ApiPropertyOptional({ description: 'Number of results per page', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Transform(({ value }) => toPositiveInt(value, 50))
  limit = 50
}
