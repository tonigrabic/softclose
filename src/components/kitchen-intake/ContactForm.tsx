'use client'

export interface ContactValue {
  name: string
  contactType: 'phone' | 'email'
  contactValue: string
}

interface ContactFormProps {
  value: ContactValue
  onChange: (value: ContactValue) => void
}

const inputClass =
  'w-full rounded-xl border border-input bg-card px-4 py-3.5 text-[0.9375rem] text-foreground shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-foreground/10 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

export function ContactForm({ value, onChange }: ContactFormProps) {
  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="intake-name"
          className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          Your name
        </label>
        <input
          id="intake-name"
          type="text"
          autoComplete="name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="First name is fine"
          className={inputClass}
        />
      </div>

      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Best way to reach you
        </span>
        <div
          className="mb-3 flex rounded-xl border border-input bg-muted/60 p-1 shadow-inner"
          role="group"
          aria-label="Contact method"
        >
          {(['phone', 'email'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ ...value, contactType: type })}
              className={`relative flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 ${
                value.contactType === type
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {type === 'phone' ? 'Phone' : 'Email'}
            </button>
          ))}
        </div>
        <label htmlFor="intake-contact" className="sr-only">
          {value.contactType === 'email' ? 'Email address' : 'Phone number'}
        </label>
        <input
          id="intake-contact"
          type={value.contactType === 'email' ? 'email' : 'tel'}
          autoComplete={value.contactType === 'email' ? 'email' : 'tel'}
          value={value.contactValue}
          onChange={(e) => onChange({ ...value, contactValue: e.target.value })}
          placeholder={value.contactType === 'email' ? 'you@email.com' : '+1 (555) 000-0000'}
          className={inputClass}
        />
      </div>
    </div>
  )
}
