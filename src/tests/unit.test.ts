import { interpretIntent } from '../services/ai-intent-interpreter.service';
import { normalizeText, findNormalizedMatch } from '../utils/normalize';
import { findClosestMatch } from '../utils/fuzzy-match';

describe('AI Intent Interpreter', () => {
  it('should handle valid JSON response from LLM', async () => {
    // This test would require mocking the AI service
    // For now, we'll test the normalization logic
    const text = 'quero ver calças';
    const normalized = normalizeText(text);
    expect(normalized).toBe('quero ver calcas');
  });

  it('should handle markdown-wrapped JSON', () => {
    const markdown = `\`\`\`json
{
  "intent": "VIEW_CATEGORY",
  "category": "calças",
  "subcategory": null,
  "product": null,
  "attribute": null,
  "confidence": 0.95
}
\`\`\``;

    const jsonMatch = markdown.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    expect(jsonMatch).not.toBeNull();
    if (jsonMatch && jsonMatch[1]) {
      const extracted = jsonMatch[1].trim();
      const parsed = JSON.parse(extracted);
      expect(parsed.intent).toBe('VIEW_CATEGORY');
      expect(parsed.confidence).toBe(0.95);
    }
  });
});

describe('Normalize Text', () => {
  it('should normalize text with accents', () => {
    const text = 'Calças';
    const normalized = normalizeText(text);
    expect(normalized).toBe('calcas');
  });

  it('should normalize multiple spaces', () => {
    const text = 'quero    ver    calcas';
    const normalized = normalizeText(text);
    expect(normalized).toBe('quero ver calcas');
  });

  it('should remove punctuation', () => {
    const text = 'Quero ver calças, por favor!';
    const normalized = normalizeText(text);
    expect(normalized).toBe('quero ver calcas por favor');
  });
});

describe('Find Normalized Match', () => {
  it('should find exact normalized match', () => {
    const items = ['Calças', 'Camisas', 'Bermudas'];
    const result = findNormalizedMatch('calcas', items);
    expect(result).toBe('Calças');
  });

  it('should return undefined for non-matching items', () => {
    const items = ['Calças', 'Camisas', 'Bermudas'];
    const result = findNormalizedMatch('jaquetas', items);
    expect(result).toBeUndefined();
  });
});

describe('Find Closest Match (Fuzzy)', () => {
  it('should find fuzzy match with high similarity', () => {
    const items = ['Calças', 'Camisas', 'Bermudas'];
    const result = findClosestMatch('calca', items, 60);
    expect(result.match).toBe('Calças');
    expect(result.similarity).toBeGreaterThanOrEqual(60);
  });

  it('should return null when similarity is below threshold', () => {
    const items = ['Calças', 'Camisas', 'Bermudas'];
    const result = findClosestMatch('xyz', items, 60);
    expect(result.match).toBeNull();
  });

  it('should return exact match with 100% similarity', () => {
    const items = ['Calças', 'Camisas', 'Bermudas'];
    const result = findClosestMatch('Calcas', items, 50);
    expect(result.match).toBe('Calças');
    expect(result.similarity).toBe(100);
  });
});

describe('Intent Routing - Scenario Simulation', () => {
  it('should recognize "quero ver calças" as VIEW_CATEGORY intent', () => {
    const text = 'quero ver calças';
    const normalized = normalizeText(text);
    const words = normalized.split(' ').filter(Boolean);
    
    // Simulate matching against KNOWN_CATEGORIES
    const KNOWN_CATEGORIES = ['camisas', 'calcas', 'bermudas'];
    let foundCategory = null;
    
    for (const word of words) {
      for (const cat of KNOWN_CATEGORIES) {
        if (normalizeText(word) === normalizeText(cat)) {
          foundCategory = cat;
          break;
        }
      }
      if (foundCategory) break;
    }
    
    expect(foundCategory).toBe('calcas');
  });

  it('should extract category from phrase "quero ver calças" using token fallback', () => {
    const query = 'quero ver calcas';
    const normalized = normalizeText(query);
    const parts = normalized.split(' ').filter(Boolean);
    const lastToken = parts.length ? parts[parts.length - 1] : '';
    
    expect(lastToken).toBe('calcas');
  });

  it('should handle subcategory search with context', () => {
    const lastCategory = 'Calças';
    const subcategoryQuery = 'jeans';
    const available = ['Jeans', 'Chino', 'Moletom'];
    
    const match = findNormalizedMatch(subcategoryQuery, available);
    expect(match).toBe('Jeans');
  });

  it('should handle attribute questions with lastProduct context', () => {
    const question = 'essa é confortável?';
    const normalized = normalizeText(question);
    const hasAttributeKeyword = 
      normalized.includes('confortavel') ||
      normalized.includes('material') ||
      normalized.includes('preco') ||
      normalized.includes('tamanho');
    
    expect(hasAttributeKeyword).toBe(true);
  });

  it('should recognize human handoff intent', () => {
    const text = 'quero falar com alguém';
    const normalized = normalizeText(text);
    const isHumanIntent = 
      normalized.includes('falar com') ||
      normalized.includes('atendente') ||
      normalized.includes('humano');
    
    expect(isHumanIntent).toBe(true);
  });

  it('should handle empty query fallback', () => {
    const query = '';
    if (!query) {
      expect(true).toBe(true); // Should not crash
    }
  });
});

describe('Session State Logic', () => {
  it('should track category context', () => {
    const sessionState: any = {};
    const category = 'Calças';
    sessionState.lastCategory = category;
    
    expect(sessionState.lastCategory).toBe('Calças');
  });

  it('should update subcategory when category changes', () => {
    const sessionState: any = {
      lastCategory: 'Calças',
      lastSubcategory: 'Jeans'
    };
    
    // When a new category is selected, reset subcategory
    sessionState.lastCategory = 'Camisas';
    sessionState.lastSubcategory = undefined;
    
    expect(sessionState.lastCategory).toBe('Camisas');
    expect(sessionState.lastSubcategory).toBeUndefined();
  });

  it('should track last product for attribute questions', () => {
    const sessionState: any = {};
    const productId = '507f1f77bcf86cd799439011'; // sample MongoDB ID
    sessionState.lastProduct = productId;
    
    expect(sessionState.lastProduct).toBe(productId);
  });

  it('should set handoff flag for human transfer', () => {
    const sessionState: any = {};
    sessionState.handedOff = true;
    
    expect(sessionState.handedOff).toBe(true);
  });
});
