import type { GradeLevel } from '../store/store'
import { strings } from '../strings'

export function GradeLevelSelect(props: {
  value: GradeLevel
  onChange: (grade: GradeLevel) => void
}) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(Number(e.target.value))}>
      {strings.gradeLevels.map((grade) => (
        <option key={grade} value={grade}>
          {strings.gradeLevel(grade)}
        </option>
      ))}
    </select>
  )
}
