export interface User {
  id: string;
  name: string;
  email: string;
  role: 'SME Owner' | 'Finance Manager' | 'Analyst';
  avatarColor: string;
  password?: string;
}
