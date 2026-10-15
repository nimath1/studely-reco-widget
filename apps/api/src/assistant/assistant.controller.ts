import { Body, Controller, Post } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { AssistantReply } from '@studely/types'
import { AssistantRequestDto } from './assistant.dto'
import { DegradedModeService } from './degraded-mode.service'

@ApiTags('Assistant')
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: DegradedModeService) {}

  @Post('message')
  @ApiOperation({ summary: 'Conversational assisted-search turn' })
  @ApiOkResponse({ description: 'Assistant reply (clarify, recommendations or fallback)' })
  async message(@Body() body: AssistantRequestDto): Promise<AssistantReply> {
    return this.assistant.answer(body)
  }
}
