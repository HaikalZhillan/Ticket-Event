import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class FilterNotificationDto {
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'sent', 'failed', 'read'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['email', 'in-app', 'sms'])
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}