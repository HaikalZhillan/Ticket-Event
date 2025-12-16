import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Role } from 'src/entities/role.entity';

@Module({
    imports: [TypeOrmModule.forFeature([User, Role])],
    exports: [TypeOrmModule, UsersService],
    controllers: [UsersController],
    providers: [UsersService],
})
export class UsersModule {}
