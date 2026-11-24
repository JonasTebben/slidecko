import { reactive } from 'vue'

// Quiz elements while presenting: picked tiles (e.g. the class's vote) and revealed solutions.
// Not part of the project: every presentation starts fresh.
export const LETTERS = 'ABCDEF'
export const quiz = reactive({ picks: {}, shown: {} })
export const picked = (id, i) => !!quiz.picks[id + ':' + i]
export const pick = (id, i) => { quiz.picks[id + ':' + i] = !picked(id, i) }
export const toggleSolution = id => { quiz.shown[id] = !quiz.shown[id] }
// static exports (PDF, PowerPoint, images): after a slide with a quiz the same slide again, with the solution marked
export const withSolutions = slides => slides.flatMap(s => (s.elements.some(e => e.type === 'quiz')
  ? [s, { ...s, id: s.id + '-solution', elements: s.elements.map(e => (e.type === 'quiz' ? { ...e, solved: true } : e)) }] : [s]))
export const resetQuiz = () => { quiz.picks = {}; quiz.shown = {} }
