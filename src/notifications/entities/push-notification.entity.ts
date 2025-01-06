import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('push_notifications')
export class PushNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.notifications, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  message: string;

  @Column({ nullable: true })
  sentAt: Date;

  @Column({ default: false })
  isSent: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
