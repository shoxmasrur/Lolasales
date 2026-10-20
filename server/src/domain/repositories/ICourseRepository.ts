import type { Course, CourseKnowledge, NewCourse, NewKnowledge } from '@/domain/entities/Course';

export interface ICourseRepository {
  list(): Promise<Course[]>;
  findById(id: string): Promise<Course | null>;
  create(data: NewCourse): Promise<Course>;
  update(id: string, patch: Partial<NewCourse>): Promise<Course>;
  remove(id: string): Promise<void>;
  listKnowledge(courseId: string): Promise<CourseKnowledge[]>;
  addKnowledge(courseId: string, data: NewKnowledge): Promise<CourseKnowledge>;
  updateKnowledge(id: string, patch: Partial<NewKnowledge>): Promise<CourseKnowledge>;
  removeKnowledge(id: string): Promise<void>;
}
