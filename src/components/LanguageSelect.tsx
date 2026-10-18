import { LANGUAGES, type Language } from '../store/store'
import { strings } from '../strings'

/** A Subject's Language. With value '' it shows a "choose" placeholder; it is always required. */
export function LanguageSelect(props: {
  value: Language | ''
  onChange: (language: Language) => void
}) {
  return (
    <select value={props.value} required onChange={(e) => props.onChange(e.target.value as Language)}>
      {props.value === '' && (
        <option value="" disabled>
          {strings.subjects.chooseLanguage}
        </option>
      )}
      {LANGUAGES.map((language) => (
        <option key={language} value={language}>
          {strings.languages[language]}
        </option>
      ))}
    </select>
  )
}
