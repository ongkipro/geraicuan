"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  applyCharacterClassEdit,
  CHARACTER_CLASS_HINTS,
  type CharacterClass,
} from "@/lib/field-character-classes";

type TextControl = HTMLInputElement | HTMLTextAreaElement;

/** How long a refusal hint stays readable after the last refused edit. */
const HINT_VISIBLE_MS = 3_000;

const INPUT_MODES: Partial<Record<CharacterClass, React.HTMLAttributes<HTMLElement>["inputMode"]>> = {
  NUMERIC_INTEGER: "numeric",
  PHONE: "tel",
  RUPIAH: "numeric",
};

function setNativeValue(element: TextControl, value: string) {
  // The prototype setter bypasses React's value tracker, so the input event
  // dispatched after it reaches a controlled field's onChange. Only for that:
  // inside onChange a bypassed tracker would keep the refused text as "last
  // seen", and the same refused key typed again would then fire no onChange.
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
}

/**
 * T-196 client lock. Cleans only the text an edit inserts — typed, pasted,
 * dropped, autofilled or composed through an IME — keeps the caret after the
 * accepted text, and exposes a polite hint that changes only when an edit is
 * refused. Characters already in the field are never touched here; the Server
 * Action decides whether a stored value is still acceptable.
 */
export function useCharacterClass<E extends TextControl>(
  kind: CharacterClass,
  {
    onChange,
    onCompositionEnd,
    onCompositionStart,
    onFocus,
  }: {
    onChange?: React.ChangeEventHandler<E>;
    onCompositionEnd?: React.CompositionEventHandler<E>;
    onCompositionStart?: React.CompositionEventHandler<E>;
    onFocus?: React.FocusEventHandler<E>;
  } = {},
) {
  const previousValue = React.useRef("");
  const composing = React.useRef(false);
  const [hint, setHint] = React.useState("");
  const hintTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(hintTimer.current), []);

  const clean = React.useCallback((element: E, notifyOwner: boolean) => {
    const edit = applyCharacterClassEdit(kind, previousValue.current, element.value);
    if (edit.value !== element.value) {
      if (notifyOwner) setNativeValue(element, edit.value);
      else element.value = edit.value;
      if (document.activeElement === element) {
        try {
          element.setSelectionRange(edit.caret, edit.caret);
        } catch {
          // Some input types have no selection; the value is still clean.
        }
      }
    }
    previousValue.current = edit.value;
    if (edit.rejected) {
      // The same text while it is showing is not announced again, so a burst of
      // refused keys reads once; the timer lets a later refusal speak afresh.
      setHint(CHARACTER_CLASS_HINTS[kind]);
      clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(""), HINT_VISIBLE_MS);
    }
    return edit;
  }, [kind]);

  const ref = React.useCallback((element: E | null) => {
    if (!element) return;
    previousValue.current = element.value;
    // Native beforeinput fires before every user edit (not autofill), so the
    // baseline also follows values set programmatically, e.g. a picked contact.
    const remember = () => {
      if (!composing.current) previousValue.current = element.value;
    };
    element.addEventListener("beforeinput", remember);
    return () => element.removeEventListener("beforeinput", remember);
  }, []);

  return {
    hint,
    inputMode: INPUT_MODES[kind],
    onChange: (event: React.ChangeEvent<E>) => {
      if (!composing.current && !(event.nativeEvent as InputEvent).isComposing) {
        clean(event.currentTarget, false);
      }
      onChange?.(event);
    },
    onCompositionEnd: (event: React.CompositionEvent<E>) => {
      composing.current = false;
      const element = event.currentTarget;
      const before = element.value;
      const edit = clean(element, true);
      onCompositionEnd?.(event);
      if (edit.value !== before) {
        // Tell a controlled owner about the cleaned composed text.
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    onCompositionStart: (event: React.CompositionEvent<E>) => {
      composing.current = true;
      onCompositionStart?.(event);
    },
    onFocus: (event: React.FocusEvent<E>) => {
      if (!composing.current) previousValue.current = event.currentTarget.value;
      onFocus?.(event);
    },
    ref,
  };
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T | null) => {
    const cleanups: Array<() => void> = [];
    for (const ref of refs) {
      if (typeof ref === "function") {
        const cleanup = ref(value);
        if (typeof cleanup === "function") cleanups.push(cleanup);
      } else if (ref) {
        (ref as React.RefObject<T | null>).current = value;
      }
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
      for (const ref of refs) {
        if (ref && typeof ref !== "function") (ref as React.RefObject<T | null>).current = null;
      }
    };
  };
}

/** The polite hint rendered under a locked field. Empty, it stays in the accessibility tree but takes no space. */
export function CharacterClassHint({ hint, id }: { hint: string; id?: string }) {
  return (
    <p
      aria-live="polite"
      className="text-xs leading-5 text-muted-foreground empty:sr-only"
      data-character-hint=""
      id={id ? `${id}-character-hint` : undefined}
    >
      {hint}
    </p>
  );
}

type CharacterClassProps = { characterClass: CharacterClass };

export function CharacterClassInput({
  characterClass,
  inputMode,
  onChange,
  onCompositionEnd,
  onCompositionStart,
  onFocus,
  ref,
  ...props
}: React.ComponentProps<typeof Input> & CharacterClassProps) {
  const lock = useCharacterClass<HTMLInputElement>(characterClass, {
    onChange,
    onCompositionEnd,
    onCompositionStart,
    onFocus,
  });
  const mergedRef = React.useMemo(() => mergeRefs(lock.ref, ref), [lock.ref, ref]);
  return (
    <>
      <Input
        {...props}
        data-character-class={characterClass}
        inputMode={inputMode ?? lock.inputMode}
        onChange={lock.onChange}
        onCompositionEnd={lock.onCompositionEnd}
        onCompositionStart={lock.onCompositionStart}
        onFocus={lock.onFocus}
        ref={mergedRef}
      />
      <CharacterClassHint hint={lock.hint} id={props.id} />
    </>
  );
}

export function CharacterClassTextarea({
  characterClass,
  onChange,
  onCompositionEnd,
  onCompositionStart,
  onFocus,
  ref,
  ...props
}: React.ComponentProps<typeof Textarea> & CharacterClassProps) {
  const lock = useCharacterClass<HTMLTextAreaElement>(characterClass, {
    onChange,
    onCompositionEnd,
    onCompositionStart,
    onFocus,
  });
  const mergedRef = React.useMemo(() => mergeRefs(lock.ref, ref), [lock.ref, ref]);
  return (
    <>
      <Textarea
        {...props}
        data-character-class={characterClass}
        onChange={lock.onChange}
        onCompositionEnd={lock.onCompositionEnd}
        onCompositionStart={lock.onCompositionStart}
        onFocus={lock.onFocus}
        ref={mergedRef}
      />
      <CharacterClassHint hint={lock.hint} id={props.id} />
    </>
  );
}
