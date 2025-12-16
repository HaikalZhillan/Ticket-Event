import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  synchronize: false,
});

async function seed() {
  console.log('🌱 Starting seed...');
  
  await AppDataSource.initialize();
  
  // Insert roles
  await AppDataSource.query(`
    INSERT INTO roles (id, name, description, created_at, updated_at)
    VALUES 
      (gen_random_uuid(), 'admin', 'Administrator', NOW(), NOW()),
      (gen_random_uuid(), 'user', 'Regular User', NOW(), NOW())
    ON CONFLICT (name) DO NOTHING;
  `);
  
  console.log('✅ Roles seeded!');
  
  await AppDataSource.destroy();
  console.log('🎉 Seed completed!');
  process.exit(0);
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});