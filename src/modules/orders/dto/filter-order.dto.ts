import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsIn, Min } from "class-validator";

export class FilterOrderDto {
    @IsOptional()
    @IsString()
    @IsIn(['pending', 'paid', 'expired', 'cancelled'])
    status?: string;

    @IsOptional()
    @IsString()
    userId?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 10;

    @IsOptional()
    @IsString()
    sortBy?: string = 'createdAt';

    @IsOptional()
    @IsIn(['ASC', 'DESC'])
    sortOrder?: 'ASC' | 'DESC' = 'DESC';
}