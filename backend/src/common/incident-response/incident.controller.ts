import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { IncidentResponseService } from './incident.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('incidents')
@UseGuards(RolesGuard)
export class IncidentController {
  constructor(private incidentService: IncidentResponseService) {}

  @Post()
  @Roles('security_admin')
  async reportIncident(@Body() alert: SecurityAlert) {
    return this.incidentService.createIncident(alert);
  }

  @Get(':id/report')
  @Roles('security_admin', 'auditor')
  async getIncidentReport(@Param('id') id: string) {
    return this.incidentService.generateIncidentReport(id);
  }

  @Get('dashboard')
  @Roles('security_admin')
  async getIncidentDashboard() {
    return {
      activeIncidents: 0,
      resolvedToday: 0,
      averageResolutionTime: '2.5 hours',
      criticalIncidents: 0,
    };
  }
}