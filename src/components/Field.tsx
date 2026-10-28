import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { AlertIcon, CloseIcon, LockIcon, SearchIcon } from './Icon';
import { IconButton } from './Button';

interface FieldShellProps {
  label: string;
  htmlFor: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}

function FieldShell({ label, htmlFor, optional, hint, error, children }: FieldShellProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {optional ? <span className="field__optional">Optional</span> : null}
      </label>
      {children}
      {error ? (
        <span className="field__error" role="alert">
          <AlertIcon size={13} />
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> {
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  /** Decorative icon shown inside the input, on the left. */
  leading?: ReactNode;
  /** Interactive control shown inside the input, on the right (e.g. a show-password toggle). */
  trailing?: ReactNode;
}

export function TextField({ label, optional, hint, error, leading, trailing, ...rest }: TextFieldProps) {
  const id = useId();
  const input = (
    <input
      {...rest}
      id={id}
      className={`input${error ? ' input--invalid' : ''}`}
      aria-invalid={error ? true : undefined}
    />
  );
  return (
    <FieldShell label={label} htmlFor={id} {...(optional ? { optional } : {})} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      {leading || trailing ? (
        <div
          className={`input-wrap${leading ? ' input-wrap--leading' : ''}${trailing ? ' input-wrap--trailing' : ''}`}
        >
          {leading ? <span className="input-wrap__leading">{leading}</span> : null}
          {input}
          {trailing ? <span className="input-wrap__trailing">{trailing}</span> : null}
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'id' | 'children'> {
  label: string;
  options: SelectOption[];
  placeholder?: string;
  optional?: boolean;
  hint?: string;
  error?: string;
}

export function SelectField({
  label,
  options,
  placeholder,
  optional,
  hint,
  error,
  ...rest
}: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell label={label} htmlFor={id} {...(optional ? { optional } : {})} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <select
        {...rest}
        id={id}
        className={`select${error ? ' select--invalid' : ''}`}
        aria-invalid={error ? true : undefined}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

interface LockedFieldProps {
  label: string;
  value: string;
  /** Explains why the value cannot change. */
  hint?: string;
}

/**
 * A value that is fixed for the lifetime of the record — the verified phone number
 * above all (PRD section 4). Rendered read-only with no edit affordance at all.
 */
export function LockedField({ label, value, hint }: LockedFieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        <span className="field__optional">
          <LockIcon size={11} /> Cannot be changed
        </span>
      </label>
      <input id={id} className="input input--locked" value={value} readOnly disabled />
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search' }: SearchInputProps) {
  const id = useId();
  return (
    <div className="search">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <span className="search__icon">
        <SearchIcon />
      </span>
      <input
        id={id}
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <span className="search__clear">
          <IconButton label="Clear search" icon={<CloseIcon size={14} />} onClick={() => onChange('')} />
        </span>
      ) : null}
    </div>
  );
}
