import { IsArray, IsUUID, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';

export class BulkCheckInDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one ticket ID is required' })
  @ArrayMaxSize(100, { message: 'Maximum 100 tickets per operation' })
  @IsUUID('all', { each: true, message: 'All ticket IDs must be valid UUIDs' })
  ticketIds: string[];
}