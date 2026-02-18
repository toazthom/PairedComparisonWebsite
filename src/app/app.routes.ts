import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home';
import { ComparisonComponent } from './components/comparison/comparison';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'comparison', component: ComparisonComponent },
];