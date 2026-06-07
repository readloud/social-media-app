import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ZeroKnowledgeProofService } from './zkp.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('zkp')
@UseGuards(AuthGuard('jwt'))
export class ZKPController {
  constructor(private zkpService: ZeroKnowledgeProofService) {}

  @Post('schedule/prove')
  async proveSchedule(@Body() schedule: PrivateScheduleData) {
    return this.zkpService.generateScheduleProof(schedule);
  }

  @Post('schedule/verify')
  async verifySchedule(@Body() verificationData: {
    proof: any;
    publicSignals: any;
  }) {
    return this.zkpService.verifySchedulePrivacyPreserving(
      'unknown',
      verificationData.proof,
      verificationData.publicSignals
    );
  }

  @Post('eligibility/prove')
  async proveEligibility(@Body() data: {
    userData: PrivateUserData;
    requirement: EligibilityRequirement;
  }) {
    return this.zkpService.proveUserEligibility(data.userData, data.requirement);
  }

  @Post('range/prove')
  async proveRange(@Body() data: {
    timestamp: number;
    min: number;
    max: number;
  }) {
    return this.zkpService.proveScheduleTimeRange(data.timestamp, data.min, data.max);
  }

  @Post('anonymous/submit')
  async submitAnonymous(@Body() data: {
    schedule: AnonymousScheduleData;
    proof: any;
  }) {
    return this.zkpService.submitAnonymousSchedule(data.schedule, data.proof);
  }

  @Post('match/private')
  async privateMatch(@Body() data: {
    userSchedules: string[];
    platformSchedules: string[];
  }) {
    return this.zkpService.privateScheduleMatching(
      data.userSchedules,
      data.platformSchedules
    );
  }

  @Get('proof/:id')
  async getProof(@Param('id') id: string) {
    return this.zkpService.getProofById(id);
  }
}