# Quiz System - Typegoose Single Source of Truth

## Overview

Scalable quiz system using **Typegoose** for a single source of truth - eliminating duplication between TypeScript types, validation, and MongoDB schemas.

## Architecture: TypeORM-Style with Typegoose

### Single Source of Truth
All entity definitions, TypeScript types, and MongoDB schemas come from **ONE place**: `QuizEntities.ts`

```typescript
class Answer {
  @prop({ required: true })
  public text!: string;
  
  @prop({ required: true })
  public isCorrect!: boolean;
}

// This class definition serves as:
// 1. TypeScript type
// 2. Mongoose schema
// 3. Runtime validation
```

### Semantic Naming

- **Quiz**: Reusable quiz template (topic + questions)
- **UserQuiz**: Junction table (User × Quiz attempt)
- **QuestionSelectedAnswers**: Junction table (Question × Selected Answers)

## File Structure (4 files)

```
quiz/
├── QuizEntities.ts    # SINGLE SOURCE OF TRUTH (Typegoose classes)
├── QuizService.ts     # Business logic
├── QuizController.ts  # HTTP endpoints (minimal Zod for API input only)
└── QuizModule.ts      # NestJS module
```

### What Happened to QuizModel.ts and QuizSchema.ts?

**Eliminated!** They were duplicating the same structure in different formats:
- ❌ `QuizSchema.ts` (Zod schemas)
- ❌ `QuizModel.ts` (Mongoose schemas)
- ✅ `QuizEntities.ts` (Typegoose - single source of truth)

## Typegoose Benefits

### Before (Duplication)

**QuizSchema.ts (Zod):**
```typescript
const AnswerZ = z.object({
  id: z.string(),
  text: z.string(),
  isCorrect: z.boolean(),
  explanation: z.string()
});
```

**QuizModel.ts (Mongoose):**
```typescript
const AnswerSchema = new Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  isCorrect: { type: Boolean, required: true },
  explanation: { type: String, default: '' }
});
```

❌ Same structure defined twice!

### After (Single Source)

**QuizEntities.ts (Typegoose):**
```typescript
class Answer {
  @prop({ required: true })
  public id!: string;
  
  @prop({ required: true })
  public text!: string;
  
  @prop({ required: true })
  public isCorrect!: boolean;
  
  @prop({ default: '' })
  public explanation!: string;
}
```

✅ One definition serves as:
1. TypeScript type
2. Mongoose schema  
3. Runtime type checking

## Entity Structure

### Sub-Documents (Embedded)

**Answer:**
```typescript
class Answer {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
}
```

**QuizItem:**
```typescript
class QuizItem {
  id: string;
  question: string;
  answers: Answer[];
  allowMultipleSelections: boolean;
}
```

**QuestionSelectedAnswers:**
```typescript
class QuestionSelectedAnswers {
  questionId: string;
  selectedAnswerIds: string[];
}
```

### Documents (Collections)

**Quiz (Reusable template):**
```typescript
@index({ topic: 1, createdAt: -1 })
class Quiz {
  topic: string;
  quizItems: QuizItem[];
  createdAt?: Date;
  updatedAt?: Date;
}
```

**UserQuiz (Junction - User × Quiz):**
```typescript
@index({ email: 1, createdAt: -1 })
@index({ quizId: 1 })
class UserQuiz {
  email: string;
  quizId?: string;          // Reference to Quiz
  topic: string;            // From Quiz (denormalized)
  quizItems: QuizItem[];    // From Quiz (snapshot)
  questionSelectedAnswers: QuestionSelectedAnswers[];
  totalCorrect: number;
  createdAt?: Date;
  updatedAt?: Date;
}
```

## Usage in Code

### Import Types and Models

```typescript
import { 
  UserQuizModel,           // Mongoose model
  type UserQuiz,           // TypeScript type
  type QuizItem,           // TypeScript type
  type QuestionSelectedAnswers  // TypeScript type
} from './QuizEntities';
```

### Use in Service

```typescript
// Create document
const userQuiz = await UserQuizModel.create({
  email,
  topic,
  quizItems,
  questionSelectedAnswers,
  totalCorrect
});

// Query documents
const docs = await UserQuizModel
  .find({ email })
  .sort({ createdAt: -1 })
  .lean()
  .exec();
```

## API Validation Strategy

**Typegoose** handles database validation.
**Zod** handles API input validation (minimal, only for HTTP requests).

```typescript
// QuizController.ts
const GenerateInputZ = z.object({ 
  email: z.string().email(), 
  topic: z.string().min(1) 
});

// Validates API input, but types come from Typegoose entities
```

## API Endpoints

### POST /quiz/generate
```bash
curl -X POST http://localhost:3000/quiz/generate \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","topic":"React"}'
```

### POST /quiz/grade
```bash
curl -X POST http://localhost:3000/quiz/grade \
  -H "Content-Type: application/json" \
  -d '{
    "email":"user@example.com",
    "topic":"React",
    "quizItems":[...],
    "questionSelectedAnswers":[
      {"questionId":"q1","selectedAnswerIds":["a2"]}
    ]
  }'
```

### GET /quiz/list?email=user@example.com
```bash
curl http://localhost:3000/quiz/list?email=user@example.com
```

## Grading Logic

**Single-Select** (default):
- User selects one answer
- Correct if `isCorrect: true`

**Multi-Select** (future):
- Set `allowMultipleSelections: true`
- Correct if ALL selected are correct AND ALL correct answers are selected

## Why Typegoose?

✅ **Single source of truth**: No duplication between types and schemas  
✅ **TypeORM-style**: Familiar decorator-based approach  
✅ **Type safety**: Full TypeScript support  
✅ **Less code**: One definition instead of two  
✅ **Maintainable**: Change once, updates everywhere  
✅ **Industry standard**: Mature, well-documented solution  

## Comparison to TypeORM

### TypeORM (SQL)
```typescript
@Entity()
class User {
  @Column()
  name: string;
}
```

### Typegoose (MongoDB)
```typescript
class User {
  @prop()
  name: string;
}
```

Same pattern, different database!

## Setup Requirements

1. **Install dependencies:**
   ```bash
   yarn add @typegoose/typegoose reflect-metadata
   ```

2. **Enable decorators in tsconfig.json:**
   ```json
   {
     "experimentalDecorators": true,
     "emitDecoratorMetadata": true
   }
   ```

3. **Import reflect-metadata in Main.ts:**
   ```typescript
   import 'reflect-metadata';
   ```

## Code Standards

- **PascalCase** file naming
- **ES6 exports**: `export { ClassName }`
- **No default exports**
- **Semantic naming**: Describes entity purpose
- **Single source of truth**: Typegoose entities only
- **Decorators**: Use `@prop()`, `@index()`, `@modelOptions()`
