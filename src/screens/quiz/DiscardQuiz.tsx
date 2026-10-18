import { useServices } from '../../app/services'
import { quizDiscardConfirmation } from '../../components/confirmations'
import { DeleteWithConfirmation } from '../../components/DeleteWithConfirmation'
import { strings } from '../../strings'

/** "Descartar quiz" for an In Progress quiz, after a confirmation. */
export function DiscardQuiz({ quizId, onDiscarded }: { quizId: number; onDiscarded?: () => void }) {
  const { store, quizSession } = useServices()
  return (
    <DeleteWithConfirmation
      action={strings.quizzes.discard.action}
      confirm={strings.quizzes.discard.confirm}
      load={async () => {
        const found = await store.getQuiz(quizId)
        return found && found.quiz.state === 'inProgress' ? quizDiscardConfirmation(found.quiz) : null
      }}
      onDelete={async () => {
        await quizSession.discard(quizId)
        onDiscarded?.()
      }}
    />
  )
}
