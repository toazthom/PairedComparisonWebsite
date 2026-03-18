import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { ComparisonComponent } from './comparison';
import { provideRouter } from '@angular/router';

// ─── Synchronous FileReader Mock ───────────────────────────────────────────
class MockFileReader {
  result: string = '';
  onload: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;

  readAsText(file: File) {
    const fr = new OriginalFileReader();
    fr.onload = (e) => {
      this.result = e.target?.result as string;
      if (this.onload) this.onload({ target: this });
    };
    fr.onerror = () => {
      if (this.onerror) this.onerror({});
    };
    fr.readAsText(file);
  }
}

const OriginalFileReader = FileReader;
(window as any).FileReader = MockFileReader;

describe('ComparisonComponent', () => {
  let component: ComparisonComponent;
  let fixture: ComponentFixture<ComparisonComponent>;

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function makeEvent(content: string, filename = 'test.csv', sizeOverride?: number): Event {
    const blob = new Blob([content], { type: 'text/csv' });
    const file = new File([blob], filename, { type: 'text/csv' });

    // For size override (2MB test), create a proxy with a fake size
    const fileToUse = sizeOverride !== undefined
      ? Object.defineProperty(new File([blob], filename), 'size', { value: sizeOverride })
      : file;

    return {
      target: { files: [fileToUse], value: '' }
    } as unknown as Event;
  }

  function uploadCSV(content: string, filename = 'test.csv') {
    component.onFileUpload(makeEvent(content, filename));
  }

  async function uploadCSVAsync(content: string, filename = 'test.csv'): Promise<void> {
    uploadCSV(content, filename);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // ─── Setup ───────────────────────────────────────────────────────────────

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComparisonComponent],
      providers: [ChangeDetectorRef, provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(ComparisonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ─────────────────────────────────────────────
  // Initial State
  // ─────────────────────────────────────────────
  describe('Initial State', () => {
    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should start in upload phase', () => {
      expect(component.phase).toBe('upload');
    });

    it('should start with empty items', () => {
      expect(component.items).toEqual([]);
    });

    it('should start with empty pairs', () => {
      expect(component.pairs).toEqual([]);
    });

    it('should start with currentPairIndex of 0', () => {
      expect(component.currentPairIndex).toBe(0);
    });

    it('should start with currentRatingIndex of 0', () => {
      expect(component.currentRatingIndex).toBe(0);
    });

    it('should start with no error message', () => {
      expect(component.errorMessage).toBe('');
    });
  });

  // ─────────────────────────────────────────────
  // File Upload Validation
  // ─────────────────────────────────────────────
  describe('File Upload Validation', () => {
    it('should reject a file with an invalid extension', () => {
      component.onFileUpload(makeEvent('data', 'test.xlsx'));
      expect(component.errorMessage).toContain('Invalid file type');
      expect(component.phase).toBe('upload');
    });

    it('should reject a file over 2MB', () => {
      // Use size override to fake a large file without allocating 2MB
      component.onFileUpload({
        target: {
          files: [Object.defineProperty(
            new File([new Blob(['data'])], 'big.csv'),
            'size',
            { value: 2 * 1024 * 1024 + 1 }
          )],
          value: ''
        }
      } as unknown as Event);
      expect(component.errorMessage).toContain('too large');
      expect(component.phase).toBe('upload');
    });

    it('should reject a file with only one item', async () => {
      await uploadCSVAsync('OnlyOneItem');
      expect(component.errorMessage).toContain('at least 2 items');
      expect(component.phase).toBe('upload');
    });

    it('should reject a file with multiple columns', async () => {
      await uploadCSVAsync('Alice,Smith\nBob,Jones');
      expect(component.errorMessage).toContain('multiple columns');
      expect(component.phase).toBe('upload');
    });

    it('should reject a file with duplicate items (case-insensitive)', async () => {
      await uploadCSVAsync('Alice\nBob\nalice');
      expect(component.errorMessage).toContain('duplicate');
      expect(component.phase).toBe('upload');
    });

    it('should reject an empty file', async () => {
      await uploadCSVAsync('');
      expect(component.errorMessage).toContain('at least 2 items');
      expect(component.phase).toBe('upload');
    });

    it('should reject a file with only blank rows', async () => {
      await uploadCSVAsync('\n\n\n');
      expect(component.errorMessage).toContain('at least 2 items');
      expect(component.phase).toBe('upload');
    });

    it('should accept a valid CSV and move to comparing phase', async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
      expect(component.phase).toBe('comparing');
      expect(component.errorMessage).toBe('');
    });

    it('should accept a .txt file', async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie', 'test.txt');
      expect(component.phase).toBe('comparing');
    });

    it('should trim whitespace from rows', async () => {
      await uploadCSVAsync('  Alice  \n  Bob  \n  Charlie  ');
      expect(component.items.map(i => i.label)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should filter out blank rows', async () => {
      await uploadCSVAsync('Alice\n\nBob\n\nCharlie');
      expect(component.items.length).toBe(3);
    });

    it('should clear a previous error message on successful upload', async () => {
      component.errorMessage = 'Some previous error';
      await uploadCSVAsync('Alice\nBob');
      expect(component.errorMessage).toBe('');
    });
  });

  // ─────────────────────────────────────────────
  // Pair Generation
  // ─────────────────────────────────────────────
  describe('Pair Generation', () => {
    it('should generate correct number of pairs for 2 items (C(2,2)=1)', async () => {
      await uploadCSVAsync('Alice\nBob');
      expect(component.pairs.length).toBe(1);
    });

    it('should generate correct number of pairs for 3 items (C(3,2)=3)', async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
      expect(component.pairs.length).toBe(3);
    });

    it('should generate correct number of pairs for 4 items (C(4,2)=6)', async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie\nDave');
      expect(component.pairs.length).toBe(6);
    });

    it('should generate correct number of pairs for 5 items (C(5,2)=10)', async () => {
      await uploadCSVAsync('A\nB\nC\nD\nE');
      expect(component.pairs.length).toBe(10);
    });

    it('should not generate duplicate pairs', async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
      const pairKeys = component.pairs.map(p =>
        [p.left.label, p.right.label].sort().join('|')
      );
      expect(new Set(pairKeys).size).toBe(pairKeys.length);
    });

    it('should not pair an item with itself', async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
      const selfPairs = component.pairs.filter(p => p.left.label === p.right.label);
      expect(selfPairs.length).toBe(0);
    });

    it('should initialize all items with 0 wins', async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
      expect(component.items.every(i => i.wins === 0)).toBe(true);
    });

    it('should initialize all items with growthRating of 0', async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
      expect(component.items.every(i => i.growthRating === 0)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // Comparison Phase
  // ─────────────────────────────────────────────
  describe('Comparison Phase', () => {
    beforeEach(async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
    });

    it('should increment currentPairIndex after a selection', () => {
      component.select('left');
      expect(component.currentPairIndex).toBe(1);
    });

    it('should increment left item wins when left is selected', () => {
      const leftItem = component.currentPair.left;
      component.select('left');
      expect(leftItem.wins).toBe(1);
    });

    it('should increment right item wins when right is selected', () => {
      const rightItem = component.currentPair.right;
      component.select('right');
      expect(rightItem.wins).toBe(1);
    });

    it('should not change wins of the non-selected item', () => {
      const rightItem = component.currentPair.right;
      component.select('left');
      expect(rightItem.wins).toBe(0);
    });

    it('should move to rating phase after all pairs are selected', () => {
      for (let i = 0; i < component.pairs.length; i++) {
        component.select('left');
      }
      expect(component.phase).toBe('rating');
    });

    it('should set currentRatingIndex to 0 when entering rating phase', () => {
      for (let i = 0; i < component.pairs.length; i++) {
        component.select('left');
      }
      expect(component.currentRatingIndex).toBe(0);
    });

    it('should accumulate total wins equal to number of pairs completed', () => {
      const selectCount = 2;
      for (let i = 0; i < selectCount; i++) {
        component.select('left');
      }
      const totalWins = component.items.reduce((sum, item) => sum + item.wins, 0);
      expect(totalWins).toBe(selectCount);
    });
  });

  // ─────────────────────────────────────────────
  // Rating Phase
  // ─────────────────────────────────────────────
  describe('Rating Phase', () => {
    beforeEach(async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
      for (let i = 0; i < component.pairs.length; i++) {
        component.select('left');
      }
    });

    it('should be in rating phase', () => {
      expect(component.phase).toBe('rating');
    });

    it('currentRatingItem should return the first sorted result', () => {
      expect(component.currentRatingItem).toEqual(component.sortedResults[0]);
    });

    it('should advance currentRatingIndex on nextRating()', () => {
      component.nextRating();
      expect(component.currentRatingIndex).toBe(1);
    });

    it('should move to results phase after all students are rated', () => {
      for (let i = 0; i < component.items.length; i++) {
        component.nextRating();
      }
      expect(component.phase).toBe('results');
    });

    it('should allow growthRating to be updated on the current item', () => {
      component.currentRatingItem.growthRating = 18;
      expect(component.currentRatingItem.growthRating).toBe(18);
    });

    it('growthRating should be within 0-25 range after manual set', () => {
      component.currentRatingItem.growthRating = 25;
      expect(component.currentRatingItem.growthRating).toBeLessThanOrEqual(25);
      expect(component.currentRatingItem.growthRating).toBeGreaterThanOrEqual(0);
    });
  });

  // ─────────────────────────────────────────────
  // Sorted Results
  // ─────────────────────────────────────────────
  describe('sortedResults', () => {
    beforeEach(async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
    });

    it('should sort items by wins descending', () => {
      component.items[0].wins = 3;
      component.items[1].wins = 1;
      component.items[2].wins = 2;
      const sorted = component.sortedResults;
      expect(sorted[0].wins).toBeGreaterThanOrEqual(sorted[1].wins);
      expect(sorted[1].wins).toBeGreaterThanOrEqual(sorted[2].wins);
    });

    it('should not mutate the original items array order', () => {
      const originalFirst = component.items[0].label;
      component.items[2].wins = 10;
      component.sortedResults;
      expect(component.items[0].label).toBe(originalFirst);
    });

    it('should contain the same number of items as the original list', () => {
      expect(component.sortedResults.length).toBe(component.items.length);
    });
  });

  // ─────────────────────────────────────────────
  // Progress
  // ─────────────────────────────────────────────
  describe('progress getter', () => {
    beforeEach(async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
    });

    it('should return 0 at the start', () => {
      expect(component.progress).toBe(0);
    });

    it('should return 100 when all pairs are done', () => {
      component.currentPairIndex = component.pairs.length;
      expect(component.progress).toBe(100);
    });

    it('should return a value between 0 and 100 mid-way', () => {
      component.currentPairIndex = 1;
      expect(component.progress).toBeGreaterThan(0);
      expect(component.progress).toBeLessThan(100);
    });

    it('should increase as more pairs are completed', () => {
      const before = component.progress;
      component.select('left');
      expect(component.progress).toBeGreaterThan(before);
    });
  });

  // ─────────────────────────────────────────────
  // Restart
  // ─────────────────────────────────────────────
  describe('restart()', () => {
    beforeEach(async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
      component.items[0].growthRating = 20;
      component.select('left');
      component.select('left');
    });

    it('should reset currentPairIndex to 0', () => {
      component.restart();
      expect(component.currentPairIndex).toBe(0);
    });

    it('should reset currentRatingIndex to 0', () => {
      component.restart();
      expect(component.currentRatingIndex).toBe(0);
    });

    it('should reset all wins to 0', () => {
      component.restart();
      expect(component.items.every(i => i.wins === 0)).toBe(true);
    });

    it('should preserve growthRatings on restart (by design)', () => {
      component.restart();
      expect(component.items[0].growthRating).toBe(20);
    });

    it('should return to comparing phase', () => {
      component.restart();
      expect(component.phase).toBe('comparing');
    });

    it('should regenerate a new pairs array reference', () => {
      const oldPairs = component.pairs;
      component.restart();
      expect(component.pairs).not.toBe(oldPairs);
    });

    it('should keep the same number of pairs after restart', () => {
      const pairCount = component.pairs.length;
      component.restart();
      expect(component.pairs.length).toBe(pairCount);
    });
  });

  // ─────────────────────────────────────────────
  // Reset
  // ─────────────────────────────────────────────
  describe('reset()', () => {
    beforeEach(async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
    });

    it('should clear all items', () => {
      component.reset();
      expect(component.items).toEqual([]);
    });

    it('should clear all pairs', () => {
      component.reset();
      expect(component.pairs).toEqual([]);
    });

    it('should reset to upload phase', () => {
      component.reset();
      expect(component.phase).toBe('upload');
    });

    it('should clear the error message', () => {
      component.errorMessage = 'Some error';
      component.reset();
      expect(component.errorMessage).toBe('');
    });

    it('should reset currentPairIndex to 0', () => {
      component.currentPairIndex = 2;
      component.reset();
      expect(component.currentPairIndex).toBe(0);
    });

    it('should reset currentRatingIndex to 0', () => {
      component.currentRatingIndex = 2;
      component.reset();
      expect(component.currentRatingIndex).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // Download Results
  // ─────────────────────────────────────────────
  describe('downloadResults()', () => {
    beforeEach(async () => {
      await uploadCSVAsync('Alice\nBob\nCharlie');
      component.items[0].wins = 2;
      component.items[0].growthRating = 15;
    });

    it('should not throw when called', () => {
      expect(() => component.downloadResults()).not.toThrow();
    });

    it('should not throw with all zero wins and ratings', () => {
      component.items.forEach(i => { i.wins = 0; i.growthRating = 0; });
      expect(() => component.downloadResults()).not.toThrow();
    });

    it('should not throw when only one item has wins', () => {
      component.items[0].wins = 5;
      expect(() => component.downloadResults()).not.toThrow();
    });
  });
});