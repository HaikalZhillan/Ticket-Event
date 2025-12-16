import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from 'src/entities/user.entity';
import { Role } from 'src/entities/role.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async findAll() {
    const users = await this.userRepository.find({
      select: [
        'id',
        'email',
        'name',
        'isVerified',
        'lastLogin',
        'roleId',
        'createdAt',
        'updatedAt',
      ],
    });

    const usersWithRoles = await Promise.all(
      users.map(async (user) => {
        const role = await this.roleRepository.findOne({
          where: { id: user.roleId },
        });
        return {
          ...user,
          role: role?.name || 'user',
        };
      }),
    );

    return {
      total: usersWithRoles.length,
      users: usersWithRoles,
    };
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['role'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    return user;
  }

  async findOneWithRoleName(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: [
        'id',
        'email',
        'name',
        'isVerified',
        'lastLogin',
        'roleId',
        'createdAt',
        'updatedAt',
      ],
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    const role = await this.roleRepository.findOne({
      where: { id: user.roleId },
    });

    return {
      ...user,
      role: role?.name || 'user',
    };
  }

  async getProfile(userId: string) {
    return this.findOneWithRoleName(userId);
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    Object.assign(user, updateUserDto);
    await this.userRepository.save(user);

    const { password: _, ...userWithoutPassword } = user;

    const role = await this.roleRepository.findOne({
      where: { id: user.roleId },
    });

    return {
      message: 'Profile updated successfully',
      user: {
        ...userWithoutPassword,
        role: role?.name || 'user',
      },
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['role'],
    });
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { id },
      relations: ['role'],
    });
  }
}
