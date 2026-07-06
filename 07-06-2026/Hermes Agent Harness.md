I am using gemini 3.1 flash lite preview

In the inital "hi" prompt it used 18.9k tokens. Initially, I thought this was a bug, but after some research I found that it the large token consumption came from the pre-installed skills being loaded into the conversation. 

I entered the prompt "can you build a portfolio site using react?". This used around 5-6k tokens which is expected as it developed a full build plan. 

Here is the output it gave from that prompt

 I have created an implementation plan for your React portfolio site. You can view the plan here:

    /Users/aryankalidindi/Desktop/hermes/.hermes/plans/2026-07-06_portfolio_plan.md

    The plan covers project initialization with Vite, setting up Tailwind CSS, component creation, assembly, and build verification.

    I am ready to execute this using the subagent-driven-development approach, where I'll dispatch a subagent for each task to ensure high quality and spec compliance. Shall I

    proceed with Task 1?



Downloaded LMStudio and added gemma4 as a local llm. Again it took around 18.6k tokens to fully load. Will now re-try the earlier prompt.


The planning on this term saved about 5k tokens at 19.9k instead of 24.3k.  

