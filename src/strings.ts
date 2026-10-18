// Every piece of UI text, in Spanish. Components never hard-code copy; they
// read it from here, so an English UI later is a translation of this file.
// Vocabulary follows GLOSSARY.md.

export const strings = {
  app: {
    name: 'Mis Exámenes',
    shortName: 'Exámenes',
    description: 'Prepara tus exámenes comprensivos con tus propios cuadernos.',
  },

  firstRun: {
    title: '¡Hola! Vamos a empezar',
    nameLabel: '¿Cómo te llamas?',
    gradeLabel: '¿En qué grado estás?',
    start: 'Empezar',
  },

  gradeLevel: (grade: number) => `${grade}.º grado`,
  gradeLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],

  home: {
    greeting: (name: string, hour: number) => {
      if (hour >= 5 && hour < 12) return `Buenos días, ${name}`
      if (hour >= 12 && hour < 19) return `Buenas tardes, ${name}`
      return `Buenas noches, ${name}`
    },
  },
}
