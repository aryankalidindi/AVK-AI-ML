

Track Hallucination levels based on prompt levels (tier1, 2, 3, etc)

Determine which metrics are actually applicable for blog and actual use.



So i created a python script that will allow me to run multiple prompts at once at varied tiers. It will also automatically record all the metrics for me. 

I have noticed we are prompt 3/11 and my Macbook battery has dropped from 33% to 22 within 10 minutes. The heat is also rapidly increasing.


During my 4th query on the first turn it timed out.






Last login: Wed Jul  8 10:00:25 on ttys016

aryankalidindi@Aryans-MacBook-Pro-2 hermes scaffold % cd hermes_scaffold/harness 

python3 run_harness.py

[1/11] Running t1-01 (tier 1, 1 turn(s))

[2/11] Running t1-02 (tier 1, 1 turn(s))

[3/11] Running t1-03 (tier 1, 1 turn(s))

[4/11] Running t2-01 (tier 2, 1 turn(s))

Traceback (most recent call last):

  File "/Users/aryankalidindi/Desktop/hermes scaffold/hermes_scaffold/harness/run_harness.py", line 289, in <module>

    main()

  File "/Users/aryankalidindi/Desktop/hermes scaffold/hermes_scaffold/harness/run_harness.py", line 230, in main

    result = call_hermes(turn_text, continue_session=(turn_num > 1))

  File "/Users/aryankalidindi/Desktop/hermes scaffold/hermes_scaffold/harness/run_harness.py", line 123, in call_hermes

    result = subprocess.run(

  File "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/lib/python3.9/subprocess.py", line 507, in run

    stdout, stderr = process.communicate(input, timeout=timeout)

  File "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/lib/python3.9/subprocess.py", line 1134, in communicate

    stdout, stderr = self._communicate(input, endtime, timeout)

  File "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/lib/python3.9/subprocess.py", line 1980, in _communicate

    self._check_timeout(endtime, orig_timeout, stdout, stderr)

  File "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/lib/python3.9/subprocess.py", line 1178, in _check_timeout

    raise TimeoutExpired(

subprocess.TimeoutExpired: Command '['hermes', '-z', 'Add pagination to the GET /items endpoint.', '--usage-file', '/var/folders/k_/8l_95g993g38zj_xdss60d300000gn/T/tmp_xe9b1hq.json', '--accept-hooks']' timed out after 300 seconds

aryankalidindi@Aryans-MacBook-Pro-2 harness %



SEPERATE:



aryankalidindi@Aryans-MacBook-Pro-2 hermes_scaffold % cd harness

python3 run_harness.py

[1/9] Running t1-01 (tier 1, 1 turn(s))

  [TIMEOUT] t1-01 turn 1 did not respond within 300s, logging and moving on

[2/9] Running t1-02 (tier 1, 1 turn(s))

  [TIMEOUT] t1-02 turn 1 did not respond within 300s, logging and moving on

[3/9] Running t1-03 (tier 1, 1 turn(s))

[4/9] Running t2-01 (tier 2, 1 turn(s))

  [TIMEOUT] t2-01 turn 1 did not respond within 300s, logging and moving on

[5/9] Running t2-02 (tier 2, 1 turn(s))

  [TIMEOUT] t2-02 turn 1 did not respond within 300s, logging and moving on

[6/9] Running t2-03 (tier 2, 1 turn(s))

[7/9] Running t3-01 (tier 3, 1 turn(s))

  [TIMEOUT] t3-01 turn 1 did not respond within 300s, logging and moving on

[8/9] Running t3-02 (tier 3, 1 turn(s))

  [TIMEOUT] t3-02 turn 1 did not respond within 300s, logging and moving on

[9/9] Running t3-03 (tier 3, 1 turn(s))

  

Done. Raw transcripts saved to /Users/aryankalidindi/Desktop/hermes scaffold/hermes_scaffold/harness/transcripts/, results logged to /Users/aryankalidindi/Desktop/hermes scaffold/hermes_scaffold/harness/results.csv

System-layer metrics (latency, tokens, tool calls, retries) were captured automatically where available.

Next: run 'python label_results.py' to fill in the Outcome/Fidelity/Risk fields for each row.

aryankalidindi@Aryans-MacBook-Pro-2 harness %








GLM 5.2: Research performance metrics compared to claude and other sources.

Use cases, deployment, memory usages.

figure out if battery usage is affected more by the LM studio or Hermes through LM studio.

