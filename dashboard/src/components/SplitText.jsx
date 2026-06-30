import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText as GSAPSplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, GSAPSplitText, useGSAP)

export default function SplitText({
  text,
  className = '',
  delay = 50,
  duration = 1.25,
  ease = 'power3.out',
  splitType = 'chars',
  from = { opacity: 0, y: 40 },
  to = { opacity: 1, y: 0 },
  threshold = 0.1,
  rootMargin = '-100px',
  textAlign = 'center',
  tag = 'p',
  onLetterAnimationComplete,
}) {
  const ref = useRef(null)
  const animationCompletedRef = useRef(false)
  const onCompleteRef = useRef(onLetterAnimationComplete)
  const [fontsLoaded, setFontsLoaded] = useState(
    () => !document.fonts || document.fonts.status === 'loaded',
  )

  useEffect(() => {
    onCompleteRef.current = onLetterAnimationComplete
  }, [onLetterAnimationComplete])

  useEffect(() => {
    if (fontsLoaded || !document.fonts) return undefined

    let cancelled = false

    document.fonts.ready.then(() => {
      if (!cancelled) setFontsLoaded(true)
    })

    return () => {
      cancelled = true
    }
  }, [fontsLoaded])

  useGSAP(
    () => {
      if (!ref.current || !text || !fontsLoaded) return undefined
      if (animationCompletedRef.current) return undefined

      const el = ref.current

      if (el._rbsplitInstance) {
        try {
          el._rbsplitInstance.revert()
        } catch {
          // GSAP can already have cleaned up during strict-mode remounts.
        }

        el._rbsplitInstance = null
      }

      const startPct = (1 - threshold) * 100
      const marginMatch = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(rootMargin)
      const marginValue = marginMatch ? parseFloat(marginMatch[1]) : 0
      const marginUnit = marginMatch ? marginMatch[2] || 'px' : 'px'
      const sign = marginValue === 0
        ? ''
        : marginValue < 0
          ? `-=${Math.abs(marginValue)}${marginUnit}`
          : `+=${marginValue}${marginUnit}`
      const start = `top ${startPct}%${sign}`

      let targets
      const assignTargets = (self) => {
        if (splitType.includes('chars') && self.chars.length) targets = self.chars
        if (!targets && splitType.includes('words') && self.words.length) targets = self.words
        if (!targets && splitType.includes('lines') && self.lines.length) targets = self.lines
        if (!targets) targets = self.chars || self.words || self.lines
      }

      const splitInstance = new GSAPSplitText(el, {
        type: splitType,
        smartWrap: true,
        autoSplit: splitType === 'lines',
        linesClass: 'split-line',
        wordsClass: 'split-word',
        charsClass: 'split-char',
        reduceWhiteSpace: false,
        onSplit: (self) => {
          assignTargets(self)

          return gsap.fromTo(
            targets,
            { ...from },
            {
              ...to,
              duration,
              ease,
              stagger: delay / 1000,
              scrollTrigger: {
                trigger: el,
                start,
                once: true,
                fastScrollEnd: true,
                anticipatePin: 0.4,
              },
              onComplete: () => {
                animationCompletedRef.current = true
                onCompleteRef.current?.()
              },
              willChange: 'transform, opacity',
              force3D: true,
            },
          )
        },
      })

      el._rbsplitInstance = splitInstance

      return () => {
        ScrollTrigger.getAll().forEach((st) => {
          if (st.trigger === el) st.kill()
        })

        try {
          splitInstance.revert()
        } catch {
          // The split may already be reverted by GSAP cleanup.
        }

        el._rbsplitInstance = null
      }
    },
    {
      dependencies: [
        text,
        delay,
        duration,
        ease,
        splitType,
        JSON.stringify(from),
        JSON.stringify(to),
        threshold,
        rootMargin,
        fontsLoaded,
      ],
      scope: ref,
    },
  )

  const Tag = tag || 'p'

  return (
    <Tag
      ref={ref}
      className={`split-parent ${className}`}
      style={{
        textAlign,
        overflow: 'hidden',
        display: 'inline-block',
        whiteSpace: 'normal',
        wordWrap: 'break-word',
        willChange: 'transform, opacity',
      }}
    >
      {text}
    </Tag>
  )
}
