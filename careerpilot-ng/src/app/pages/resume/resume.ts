import { Component, OnInit, signal, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { UserService } from '../../core/services/user';
import { ApiService } from '../../core/services/api';
import { ToastService } from '../../core/services/toast';

@Component({
  selector: 'app-resume',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './resume.html'
})
export class ResumeComponent implements OnInit {
  userSvc = inject(UserService);
  api     = inject(ApiService);
  toast   = inject(ToastService);
  user    = this.userSvc.user;
  status  = signal('');
  dragOver = signal(false);

  ngOnInit() {
    if (!this.user()) this.userSvc.load().subscribe();
  }

  get resumeFile() { return this.user()?.resumeFile; }
  get previewUrl() { return this.api.fileUrl('/users/me/resume/preview'); }
  get downloadUrl() { return this.api.fileUrl('/users/me/resume/download'); }

  handleFile(file: File) {
    if (!file) return;
    this.status.set('Uploading…');
    this.userSvc.uploadResume(file).subscribe({
      next: () => { this.status.set('✓ Résumé uploaded'); this.toast.show('Résumé uploaded'); },
      error: () => { this.status.set('✗ Upload failed — try again'); }
    });
  }

  onFileChange(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.handleFile(f);
  }

  onDrop(e: DragEvent) {
    e.preventDefault(); this.dragOver.set(false);
    const f = e.dataTransfer?.files[0]; if (f) this.handleFile(f);
  }
}
