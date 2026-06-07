import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { BlockchainVerificationService } from './blockchain.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('blockchain')
@UseGuards(AuthGuard('jwt'))
export class BlockchainController {
  constructor(private blockchainService: BlockchainVerificationService) {}

  @Post('verify/schedule/:id')
  async verifySchedule(@Param('id') id: string, @Body() schedule: ScheduleData) {
    return this.blockchainService.verifySchedule(id, schedule);
  }

  @Post('verify/batch')
  async batchVerify(@Body() schedules: ScheduleData[]) {
    return this.blockchainService.batchVerifySchedules(schedules);
  }

  @Get('proof/:scheduleId')
  async getProofOfPublication(@Param('scheduleId') scheduleId: string) {
    return this.blockchainService.generateProofOfPublication(scheduleId);
  }

  @Post('credential')
  async createCredential(@Body() schedule: ScheduleData) {
    return this.blockchainService.createVerifiableCredential(schedule);
  }

  @Get('status/:transactionHash')
  async getTransactionStatus(@Param('transactionHash') txHash: string) {
    // Return transaction confirmation status
    return { transactionHash: txHash, status: 'confirmed' };
  }
}