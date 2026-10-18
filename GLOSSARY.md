# Comprehensive Exams

A study companion that helps a Student prepare for each quarter's comprehensive exams by turning her scanned notebook pages into study aids and practice quizzes.

## Language

### People and structure

**Student**:
One of the daughters using the app to prepare for her exams; she has a name and a Grade Level.
_Avoid_: User, kid, profile

**Grade Level**:
The school grade the Student is in, which sets how simply generated content is written.
_Avoid_: Grade, school year

**Subject**:
A school subject the Student studies across periods, such as Matemáticas or Science. It has a single Language.
_Avoid_: Course, class, topic

**Language**:
The language a Subject is taught in (Spanish or English); everything produced for that Subject is in it.
_Avoid_: Locale

**Period**:
One of the four quarters of an August–June school year, written like "2026–2027 · Q1".
_Avoid_: Term, quarter, semester

**Exam**:
The real comprehensive exam for one Subject in one Period, and the study space that gathers everything used to prepare for it.
_Avoid_: Test, evaluation, subject-period

**Exam Date**:
The day the real Exam is taken, when known.

### Study material

**Material**:
One scanned file added to an Exam (one or more pages) together with its Recognized Text.
_Avoid_: Document, upload, scan, notes

**Page**:
A single scanned page within a Material.

**Recognized Text**:
The text read from a Page's scan, as corrected by the Student; it is the source for every Study Aid and Practice Quiz.
_Avoid_: OCR output, transcript

### Studying

**Study Aid**:
Anything generated to study from rather than to be tested on: a Summary or an Explainer.

**Summary**:
A study guide covering all of an Exam's Material, organized by topic; an Exam has at most one.
_Avoid_: Notes, recap, study guide

**Outdated**:
The state of a Summary whose Exam's Material, or whose Subject's Language, has changed since it was made.
_Avoid_: Stale, expired

**Explainer**:
A deeper, web-sourced explanation of one topic from an Exam's Material, with cited sources.
_Avoid_: Research, more info, deep dive

### Practicing

**Practice Quiz**:
A generated multiple-choice quiz of up to 20 Questions on an Exam's Material, together with the Student's answers and Score.
_Avoid_: Evaluation, test, exam

**Mistakes Quiz**:
A Practice Quiz made of the Exam's Mistakes, reused rather than regenerated.
_Avoid_: Retry quiz, review quiz

**Question**:
One item in a Practice Quiz: a prompt with four options, exactly one correct.

**In Progress**:
The state of a Practice Quiz that has been started but not submitted; it has no Score yet.
_Avoid_: Draft, unfinished

**Submitted**:
The state of a Practice Quiz whose answers are final and which has a Score and Feedback.
_Avoid_: Completed, finished

**Score**:
The number of Questions answered correctly out of the total in a submitted Practice Quiz.
_Avoid_: Puntuation, grade

**Feedback**:
For each Question answered wrong, the Student's choice, the correct option, and a short explanation pointing back to its Material.

**Mistake**:
A Question the Student answered wrong in a submitted Practice Quiz and has not since answered correctly in a Mistakes Quiz.
_Avoid_: Error, wrong answer

### Keeping her work

**Backup**:
One file holding everything on a tablet (Subjects, Periods, Exams, Material with its original scans, Study Aids, quizzes and Settings) except the OpenRouter key; importing it replaces everything on a tablet ("Copia de seguridad" in the UI).
_Avoid_: Export, dump, sync
