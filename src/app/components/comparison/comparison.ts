import { Component, ChangeDetectorRef } from '@angular/core';

interface Item {
  label: string;
  wins: number;
  growthRating: number;
}

interface Pair {
  left: Item;
  right: Item;
}

@Component({
  selector: 'app-comparison',
  standalone: true,
  imports: [],
  templateUrl: './comparison.html',
  styleUrl: './comparison.css'
})
export class ComparisonComponent {
  items: Item[] = [];
  pairs: Pair[] = [];
  currentPairIndex = 0;
  done = false;
  fileLoaded = false;
  errorMessage = '';

  constructor(private cdr: ChangeDetectorRef) {}

onFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;

  const file = input.files[0];
  this.errorMessage = '';

  // Check file extension
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith('.csv') && !fileName.endsWith('.txt')) {
    this.errorMessage = 'Invalid file type. Please upload a .csv or .txt file.';
    input.value = '';
    return;
  }

  // Check file size (2MB max)
  if (file.size > 2 * 1024 * 1024) {
    this.errorMessage = 'File is too large. Please keep it under 2MB.';
    input.value = '';
    return;
  }

  const reader = new FileReader();

  reader.onload = (e) => {
    const text = e.target?.result as string;
    const rows = text
      .split('\n')
      .map(r => r.trim())
      .filter(r => r.length > 0);

      // Check for multiple columns (commas suggest more than one column)
      const hasMultipleColumns = rows.some(r => r.includes(','));
      if (hasMultipleColumns) {
        this.errorMessage = 'Your file appears to have multiple columns. Please upload a single-column file with one item per row.';
        input.value = '';
        this.cdr.detectChanges();
        return;
      }

      // Check there are at least 2 items
      if (rows.length < 2) {
        this.errorMessage = 'Please include at least 2 items in your file.';
        input.value = '';
        this.cdr.detectChanges();
        return;
      }

      // Check for duplicate items
      const unique = new Set(rows.map(r => r.toLowerCase()));
      if (unique.size !== rows.length) {
        this.errorMessage = 'Your file contains duplicate items. Please make sure every row is unique.';
        input.value = '';
        this.cdr.detectChanges();
        return;
      }

      this.items = rows.map(label => ({ label, wins: 0, growthRating: 0 }));
      this.pairs = this.generatePairs(this.items);
      this.currentPairIndex = 0;
      this.done = false;
      this.fileLoaded = true;
      this.cdr.detectChanges();
    };

    reader.onerror = () => {
      this.errorMessage = 'There was a problem reading your file. Please try again.';
      this.cdr.detectChanges();
    };

    reader.readAsText(file);
  }

  generatePairs(items: Item[]): Pair[] {
    const pairs: Pair[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        pairs.push({ left: items[i], right: items[j] });
      }
    }
    // Shuffle so it doesn't feel predictable
    return pairs.sort(() => Math.random() - 0.5);
  }

  select(winner: 'left' | 'right') {
    const pair = this.pairs[this.currentPairIndex];
    if (winner === 'left') {
      pair.left.wins++;
    } else {
      pair.right.wins++;
    }

    this.currentPairIndex++;
    if (this.currentPairIndex >= this.pairs.length) {
      this.done = true;
    }
  }

  get currentPair(): Pair {
    return this.pairs[this.currentPairIndex];
  }

  get sortedResults(): Item[] {
    return [...this.items].sort((a, b) => b.wins - a.wins);
  }

  get progress(): number {
    return Math.round((this.currentPairIndex / this.pairs.length) * 100);
  }

  restart() {
    this.items.forEach(i => i.wins = 0);
    this.pairs = this.generatePairs(this.items);
    this.currentPairIndex = 0;
    this.done = false;
  }

  reset() {
    this.items = [];
    this.pairs = [];
    this.currentPairIndex = 0;
    this.done = false;
    this.fileLoaded = false;
  }

  downloadResults() {
    const header = 'Item,Times Selected,Growth Since Fall';
    const rows = this.sortedResults.map(item => `${item.label},${item.wins},${item.growthRating}`);
    const csv = [header, ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'comparison-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}