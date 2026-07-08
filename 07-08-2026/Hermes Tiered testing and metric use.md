

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