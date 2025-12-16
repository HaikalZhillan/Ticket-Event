import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Reason must be less than 255 characters' })
  reason?: string;
}
