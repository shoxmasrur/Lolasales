export type LinkAfter = 'birinchi_qism' | 'toliq';

/** Kursning narx varianti (masalan, seminar qatori). `price` — so'm. */
export interface PriceOption {
  readonly label: string;
  readonly price: number;
}

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
  /** Narx variantlari; bo'sh yoki yo'q — kursning bitta narxi (`price`). */
  priceOptions?: readonly PriceOption[];
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

/**
 * Bo'lib to'lash maydonlari izchilmi; xato bo'lsa foydalanuvchiga matn,
 * aks holda `null`. Bazadagi CHECK (008-migratsiya) bilan bir xil qoida.
 */
export function bolibTolashXatosi(c: Pick<Course, 'price' | 'installmentAllowed' | 'installmentParts' | 'installmentFirstMin'>): string | null {
  if (c.installmentFirstMin !== null && c.installmentFirstMin > c.price) {
    return "Birinchi qism kurs narxidan katta bo'lmasin";
  }
  if (c.installmentAllowed && (c.installmentParts === null || c.installmentParts < 2)) {
    return "Bo'lib to'lashda qismlar soni kamida 2 bo'lsin";
  }
  return null;
}
