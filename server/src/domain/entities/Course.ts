export type LinkAfter = 'birinchi_qism' | 'toliq';

export interface Course {
  id: string;
  name: string;
  description: string | null;
  /** YYYY-MM-DD, ikkalasi ham kiradi. */
  salesStart: string;
  salesEnd: string;
  price: number;
  duration: string | null;
  topics: string[];
  startsOn: string | null;
  groupLink: string | null;
  isActive: boolean;
  installmentAllowed: boolean;
  installmentParts: number | null;
  installmentFirstMin: number | null;
  linkAfter: LinkAfter;
}

export type KnowledgeKind = 'dastur' | 'savol_javob' | 'etiroz' | 'boshqa';

export interface CourseKnowledge {
  id: string;
  courseId: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  sortOrder: number;
  isEnabled: boolean;
}

export type NewCourse = Omit<Course, 'id'>;
export type NewKnowledge = Omit<CourseKnowledge, 'id' | 'courseId'>;

const tartib = (a: Course, b: Course): number =>
  a.salesStart < b.salesStart ? -1 : a.salesStart > b.salesStart ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Faol va sotuv davri ichidagi kurslar (chegaralar kiradi), salesStart bo'yicha. */
export function sotuvdagiKurslar(courses: Course[], todayIso: string): Course[] {
  return courses
    .filter((c) => c.isActive && c.salesStart <= todayIso && todayIso <= c.salesEnd)
    .sort(tartib);
}

/** Faol kurslardan sotuvi hali boshlanmaganlarning eng yaqini. */
export function keyingiKurs(courses: Course[], todayIso: string): Course | null {
  return courses.filter((c) => c.isActive && c.salesStart > todayIso).sort(tartib)[0] ?? null;
}
