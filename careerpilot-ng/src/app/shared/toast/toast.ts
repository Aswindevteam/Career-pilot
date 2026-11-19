import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `<div id="toast" [class.show]="toast.visible()">{{ toast.message() }}</div>`
})
export class ToastComponent {
  toast = inject(ToastService);
}
