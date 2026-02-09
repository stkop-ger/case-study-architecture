# Design decisions

## Local env setup / dependencies
As the dependency versions showed some critical security warnings and as this was a new project  I've update most of the dependencies and removed the ones which were pointing to Marta for event handling. 

As I planned to let Codex write the code, I've created a CODEX.md file to instruct it about the purpose of the current folder structure along with some other good practces with this line up. 

A Docker compose file has been created for the local Postgres which runs under a different port than my native one along with a Redis instance. 

## Data layer
I've started by creating an abstractEntity base class which contains timestamp fields that most other entities should have anyway.
The UserEntity got in addition to the requested fields and the timestamps and field for email confirmation and a limited length for the text fields.

I figured that indices on the fields like email, first name and last name would be handy for the future, especially since the user table is not expected to be very Write heavy but would be usually searched often by various fields.

I've made good experiences with TypeOrm migrations that are controlled via npm scripts. Usually, we run them within the start command of the Docker container. 

## Refresh tokens and rate limits
To persist both feature related data types I chose Redis as it is very handy with its TTL mechanic to hold data which is be design temporary.

## Signup and authentication
I've added timingSafeEqual which compares two buffers in constant time, so an attacker can’t infer how much of a password hash matches based on response timing.  Emails got normalized to lowercase at the service layer and in UserRepository.findByEmail() so uniqueness is enforced case‑insensitively and lookups are consistent.

# Tests
Tests went into a folder next to the testable code. Compared to one big test folder that holds everything this turned out to be more convinient when it comes to finding the right test for the testable code quickly. The tests for the endpoints are fully end2end which the service is covered by unit tests. 