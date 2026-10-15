import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from 'class-validator'
import type { AssistantMessage, AssistantRequest, AssistantSource } from '@studely/types'

const ASSISTANT_SOURCES: AssistantSource[] = [
  'home',
  'header',
  'catalogue',
  'formation',
  'centre',
  'editorial',
  'engine'
]

export class AssistantMessageDto implements AssistantMessage {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant'

  @ApiProperty({ description: 'Message content' })
  @IsString()
  @MaxLength(4000)
  content!: string
}

export class AssistantContextDto {
  @ApiPropertyOptional({ enum: ASSISTANT_SOURCES })
  @IsOptional()
  @IsIn(ASSISTANT_SOURCES)
  source?: AssistantSource

  @ApiPropertyOptional({ description: 'City / area pre-filled by the entry point' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  centerSlug?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  formationSlug?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  theme?: string

  @ApiPropertyOptional({ description: 'Famille consultée (catalogue / page famille)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  familleSlug?: string

  @ApiPropertyOptional({ type: [String], description: 'Active catalog filters (labels)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  filters?: string[]
}

export class AssistantRequestDto implements AssistantRequest {
  @ApiProperty({ description: 'New user message' })
  @IsString()
  @MaxLength(2000)
  message!: string

  @ApiPropertyOptional({ type: [AssistantMessageDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AssistantMessageDto)
  history?: AssistantMessageDto[]

  @ApiPropertyOptional({ type: AssistantContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantContextDto)
  context?: AssistantContextDto
}
