import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1];

export function FadeUp({ children, delay = 0, className = "", mount = false, ...rest }) {
    const trigger = mount
        ? { animate: { opacity: 1, y: 0 } }
        : { whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.15 } };
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 40 }}
            {...trigger}
            transition={{ duration: 0.9, ease: EASE, delay }}
            {...rest}
        >
            {children}
        </motion.div>
    );
}

export function MaskedLines({
    lines,
    className = "",
    lineClassName = "",
    delay = 0,
    inView = false,
    testIdPrefix = "masked-line",
}) {
    const container = {
        hidden: {},
        show: { transition: { staggerChildren: 0.12, delayChildren: delay } },
    };
    const line = {
        hidden: { y: "115%" },
        show: { y: "0%", transition: { duration: 1.05, ease: EASE } },
    };
    const MotionParent = inView ? motion.div : motion.div;
    const props = inView
        ? { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.3 } }
        : { initial: "hidden", animate: "show" };
    return (
        <MotionParent
            className={className}
            variants={container}
            data-testid={`${testIdPrefix}-group`}
        >
            {lines.map((l, i) => (
                <span
                    key={i}
                    className={`block overflow-hidden ${lineClassName}`}
                >
                    <motion.span className="block will-change-transform" variants={line}>
                        {l}
                    </motion.span>
                </span>
            ))}
        </MotionParent>
    );
}

export { EASE };
