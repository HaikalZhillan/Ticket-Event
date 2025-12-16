import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackgroundJob } from './entities/background-job.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BackgroundJob])],
  exports: [TypeOrmModule],
})
export class BackgroundJobsModule {}