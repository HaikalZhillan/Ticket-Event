import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../../entities/event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { FilterEventDto } from './dto/filter-event.dto';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}

  async create(createEventDto: CreateEventDto, userId: string) {
    const { startTime, endTime } = createEventDto;

    if (new Date(startTime) >= new Date(endTime)) {
      throw new BadRequestException('End time must be after start time');
    }

    if (new Date(startTime) < new Date()) {
      throw new BadRequestException('Start time cannot be in the past');
    }

    const event = this.eventRepository.create({
        ...createEventDto,
         startTime,
        endTime,
        createdBy: userId,
        availableTickets: createEventDto.quota,
        status: 'draft',
    });

    return await this.eventRepository.save(event);
  }

  async findAll(filterDto: FilterEventDto) {
    const { search, status, categoryId, sortBy, sortOrder } = filterDto;
    const page = filterDto.page || 1;
    const limit = filterDto.limit || 10;

    const queryBuilder = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.category', 'category')
      .leftJoinAndSelect('event.creator', 'creator');
    
    if (search) {
      queryBuilder.andWhere(
        '(event.title ILIKE :search OR event.description ILIKE :search OR event.location ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('event.status = :status', { status });
    }

    if (categoryId) {
      queryBuilder.andWhere('event.categoryId = :categoryId', { categoryId });
    }

    const sortField = sortBy || 'createdAt';
    const sortDirection = sortOrder || 'DESC';
    queryBuilder.orderBy(`event.${sortField}`, sortDirection as 'ASC' | 'DESC');

    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['category', 'creator'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID '${id}' not found`);
    }

    event.viewCount += 1;
    await this.eventRepository.save(event);

    return event;
  }

  async update(id: string, updateEventDto: UpdateEventDto, userId: string) {
    const event = await this.findOne(id);

    if (event.createdBy !== userId) {
      throw new BadRequestException('You can only update your own events');
    }

    if (updateEventDto.startTime || updateEventDto.endTime) {
      const startTime = updateEventDto.startTime
        ? new Date(updateEventDto.startTime)
        : event.startTime;
      const endTime = updateEventDto.endTime
        ? new Date(updateEventDto.endTime)
        : event.endTime;

      if (startTime >= endTime) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    if (updateEventDto.quota !== undefined) {
      const soldTickets = event.quota - event.availableTickets;
      if (updateEventDto.quota < soldTickets) {
        throw new BadRequestException(
          `Cannot reduce quota below sold tickets (${soldTickets})`,
        );
      }
      event.availableTickets = updateEventDto.quota - soldTickets;
    }

    Object.assign(event, updateEventDto);
    return await this.eventRepository.save(event);
  }

  async publish(id: string) {
    const event = await this.findOne(id);

    if (event.status === 'published') {
      throw new BadRequestException('Event is already published');
    }

    event.status = 'published';
    await this.eventRepository.save(event);

    return {
      message: `Event '${event.title}' has been published`,
      event,
    };
  }

  async unpublish(id: string) {
    const event = await this.findOne(id);

    if (event.status !== 'published') {
      throw new BadRequestException('Event is not published');
    }

    event.status = 'draft';
    await this.eventRepository.save(event);

    return {
      message: `Event '${event.title}' has been unpublished`,
      event,
    };
  }

  async softDelete(id: string) {
    const event = await this.findOne(id);

    await this.eventRepository.softRemove(event);

    return {
      message: `Event '${event.title}' has been deleted`,
    };
  }

  async remove(id: string) {
    const event = await this.eventRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!event) {
      throw new NotFoundException(`Event with ID '${id}' not found`);
    }

    await this.eventRepository.remove(event);

    return {
      message: `Event '${event.title}' has been permanently deleted`,
    };
  }

  async restore(id: string) {
    const event = await this.eventRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!event) {
      throw new NotFoundException(`Event with ID '${id}' not found`);
    }

    if (!event.deletedAt) {
      throw new BadRequestException('Event is not deleted');
    }

    await this.eventRepository.recover(event);

    return {
      message: `Event '${event.title}' has been restored`,
      event,
    };
  }
}