"""Short-lived chat AI worker: loads the local model, answers one message,
streams words to stdout as JSON lines, exits.

Runs OUTSIDE the main website process so the pod's 8GB memory cap can never
OOM-kill the site itself. Started on demand by ai_local.py.
"""
import json
import sys

import torch

torch.set_num_threads(10)


def chat_job(message, system_path):
    import time as _time

    from transformers import AutoModelForCausalLM, AutoTokenizer

    with open(system_path) as f:
        system_prompt = f.read().strip()

    repo = "Qwen/Qwen2.5-0.5B-Instruct"
    tok = AutoTokenizer.from_pretrained(repo)
    try:
        model = AutoModelForCausalLM.from_pretrained(
            repo, dtype=torch.bfloat16, low_cpu_mem_usage=True
        )
    except Exception:
        model = AutoModelForCausalLM.from_pretrained(
            repo, dtype=torch.float32, low_cpu_mem_usage=True
        )
    model.eval()

    conversation = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message},
    ]
    enc = tok.apply_chat_template(
        conversation, tokenize=True, add_generation_prompt=True, return_tensors="pt", return_dict=True
    )
    with torch.inference_mode():
        out = model.generate(
            **enc,
            max_new_tokens=140,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
        )
    text = tok.decode(out[0][enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()
    # the text is genuinely model-generated; emitting it word-by-word gives the
    # same typing effect in the chat bubble without version-specific streamers
    if text:
        for word in text.split(" "):
            print(json.dumps({"delta": word + " "}), flush=True)
            _time.sleep(0.02)
    print(json.dumps({"done": True}), flush=True)


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "chat":
        chat_job(sys.argv[2], sys.argv[3])
