import { Component, OnInit, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import { UserService } from '../../core/services/user';
import { ToastService } from '../../core/services/toast';
import { User, JobProfile } from '../../core/models';

const PORTALS = ['naukri','shine','linkedin','indeed','hirist'];
const SKILLS = ['JavaScript','TypeScript','React','Angular','Vue.js','Node.js','Express','Python','Django','Flask','Java','Spring Boot','C#','.NET','Go','Rust','PHP','SQL','PostgreSQL','MySQL','MongoDB','Redis','Docker','Kubernetes','AWS','GCP','Azure','Git','HTML','CSS','Tailwind','GraphQL','REST API','Machine Learning','TensorFlow','Data Science'];
const CITIES = ['Bangalore','Chennai','Mumbai','Delhi','Hyderabad','Pune','Kolkata','Ahmedabad','Jaipur','Noida','Gurgaon','Kochi','Chandigarh','Coimbatore','Mysore','Surat','Remote'];

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, TitleCasePipe],
  templateUrl: './profile.html'
})
export class ProfileComponent implements OnInit {
  userSvc = inject(UserService);
  toast   = inject(ToastService);
  user    = this.userSvc.user;
  saving  = signal(false);

  // form fields
  name = '';
  autoApply = false; dailyCap = 50; minMatch = 75;
  portals: Record<string, { checked: boolean; email: string; password: string }> = {};
  profiles: JobProfile[] = [];

  // chip input helpers
  skillInput = ''; cityInput = '';
  PORTALS = PORTALS; SKILLS = SKILLS; CITIES = CITIES;

  ngOnInit() {
    const load$ = this.user() ? null : this.userSvc.load();
    (load$ || { subscribe: (cb: any) => cb({ next: () => this.populate() }) });
    if (this.user()) this.populate();
    else this.userSvc.load().subscribe(() => this.populate());
  }

  populate() {
    const u = this.user(); if (!u) return;
    this.name = u.name || '';
    this.autoApply = u.settings?.autoApply || false;
    this.dailyCap  = u.settings?.dailyCap  || 50;
    this.minMatch  = u.settings?.minMatch  || 75;
    this.profiles  = JSON.parse(JSON.stringify(u.jobProfiles || []));
    PORTALS.forEach(p => {
      const pc = (u.portals as any)?.[p] || {};
      this.portals[p] = { checked: !!pc.email, email: pc.email || '', password: pc.passwordEnc || '' };
    });
  }

  save() {
    this.saving.set(true);
    const portalsBody: any = {};
    PORTALS.forEach(p => {
      const pc = this.portals[p];
      portalsBody[p] = pc.checked ? { email: pc.email, passwordEnc: pc.password } : { email: '', passwordEnc: '' };
    });
    const active = this.profiles.find(p => p.isActive) || this.profiles[0];
    const body = {
      name: this.name, role: active?.role || '',
      skills: active?.skills || [], cities: active?.cities || [],
      portals: portalsBody,
      settings: { autoApply: this.autoApply, dailyCap: this.dailyCap, minMatch: this.minMatch }
    };
    this.userSvc.patch(body as any).subscribe({
      next: () => { this.toast.show('Profile saved'); this.saving.set(false); },
      error: e => { this.toast.show('Save failed: ' + (e.error?.error || e.message)); this.saving.set(false); }
    });
  }

  addProfile() {
    this.userSvc.addJobProfile({ label: 'New Profile', role: '', skills: [], cities: [], isActive: this.profiles.length === 0 })
      .subscribe({ next: profiles => this.profiles = profiles, error: () => this.toast.show('Failed to add') });
  }

  deleteProfile(id: string) {
    if (this.profiles.length === 1) { this.toast.show('Keep at least one profile'); return; }
    this.userSvc.deleteJobProfile(id).subscribe({ next: profiles => this.profiles = profiles, error: () => {} });
  }

  setActive(id: string) {
    this.userSvc.updateJobProfile(id, { isActive: true })
      .subscribe({ next: profiles => this.profiles = profiles, error: () => {} });
  }

  addSkillChip(profile: JobProfile, val: string) {
    const v = val.trim(); if (!v || profile.skills.includes(v)) return;
    profile.skills = [...profile.skills, v]; this.skillInput = '';
  }
  removeSkillChip(profile: JobProfile, s: string) { profile.skills = profile.skills.filter(x => x !== s); }

  addCityChip(profile: JobProfile, val: string) {
    const v = val.trim(); if (!v || profile.cities.includes(v)) return;
    profile.cities = [...profile.cities, v]; this.cityInput = '';
  }
  removeCityChip(profile: JobProfile, c: string) { profile.cities = profile.cities.filter(x => x !== c); }

  onSkillKey(e: KeyboardEvent, profile: JobProfile, input: HTMLInputElement) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); this.addSkillChip(profile, input.value); input.value = ''; }
  }
  onCityKey(e: KeyboardEvent, profile: JobProfile, input: HTMLInputElement) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); this.addCityChip(profile, input.value); input.value = ''; }
  }
}
