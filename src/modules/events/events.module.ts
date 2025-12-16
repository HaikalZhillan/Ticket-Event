import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { Event } from '../../entities/event.entity';
import { AuthModule } from '../../auth/auth.module';
import { EventCategory } from 'src/entities/event-category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Event, EventCategory]), AuthModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService, TypeOrmModule],
})
export class EventsModule {}
