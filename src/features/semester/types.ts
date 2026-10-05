export type Semester = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
};
export type Course = {
  id: string;
  semester_id: string | null;
  kind?: "course" | "personal";
  name: string;
  code: string;
  credits: number;
  color: string;
  task_count?: number;
  completed_count?: number;
};
export type Task = {
  id: string;
  course_id: string;
  title: string;
  due_date: string | null;
  completed_at: string | null;
  course_name?: string;
  course_color?: string;
};
export type DashboardData = {
  semester: Semester;
  courses: Course[];
  tasks: Task[];
};
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
