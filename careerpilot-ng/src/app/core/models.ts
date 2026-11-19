export interface JobProfile {
  _id?: string;
  label: string;
  role: string;
  skills: string[];
  cities: string[];
  isActive: boolean;
}

export interface ResumeFile {
  originalName: string;
  storedName: string;
  mimetype: string;
  size: number;
  uploadedAt: string;
}

export interface PortalCred {
  email: string;
  passwordEnc: string;
}

export interface User {
  _id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  role: string;
  skills: string[];
  cities: string[];
  jobProfiles: JobProfile[];
  resumeFile?: ResumeFile;
  portals: { [key: string]: PortalCred };
  settings: { minMatch: number; dailyCap: number; autoApply: boolean };
}

export interface Job {
  _id: string;
  title: string;
  company: string;
  location: string;
  portal: string;
  url: string;
  skills: string[];
  matchScore: number;
}

export interface Application {
  _id: string;
  job: Job;
  status: 'applied' | 'interview' | 'offer' | 'rejected' | 'skipped';
  appliedAt: string;
  portal: string;
  matchScore: number;
}

export interface PortalStatus {
  step: string;
  error: string | null;
  ts: number;
  portal?: string;
  stale?: boolean;
}
