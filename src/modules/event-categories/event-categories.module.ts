// event-categories.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventCategoriesService } from './event-categories.service';
import { EventCategoriesController } from './event-categories.controller';
import { EventCategory } from '../../entities/event-category.entity';
import { Event } from '../../entities/event.entity'; // ← PENTING: Tambahkan ini

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EventCategory,
      Event, // ← PENTING: Tambahkan ini
    ]),
  ],
  controllers: [EventCategoriesController],
  providers: [EventCategoriesService],
  exports: [EventCategoriesService],
})
export class EventCategoriesModule {}