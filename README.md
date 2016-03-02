Screen-diff tool
===

The `ddg-screen-diff` tool can take a screenshot of a given page / search / IA, against any hostname, with multiple browsers.

This is an internal tool and is still under active development. Our priorities are:

1. Make it as useful as possible for our internal team.
2. Make it useful to our open source contributors.
3. Break it apart into a generalized NPM module with a plugin-based architecture that anyone could use for their own website.

If you have any ideas about how to make this happen feel free to create an issue or a pull request.

Setup
---

You need to install [NodeJS](https://nodejs.org/) - the preferred method will depend on your distro. We've only tested this with v10.37, but it *should* work with newer versions of NodeJS.

```
$ sudo npm install -g ddg-screen-diff
```

With a Debian-based Linux distro you may get an error like `node: not found`. The fix for that is to install the `nodejs-legacy` package (`sudo apt-get install nodejs-legacy`).

Also, make sure that you've got PhantomJS and ImageMagick (or GraphicsMagick) in your $PATH.

Usage
---

```
$ ddg-screen-diff -h

Usage: ddg-screen-diff [--version] [--help] <command> ... [options]

Commands:
  search  Create a screenshot against a search query
  path    Create a screenshot against an arbitrary path
  ia      Create a screenshot against an IA
  group   Create a screenshot against a pre-defined group

Options:
  --version   Show version number                                                          [boolean]
  -h, --help  Show help                                                                    [boolean]

```

Search commands
---

### path

```
Usage: ddg-screen-diff path <path> [<host|env> ...] [options]
```

Takes a screenshot against an arbitrary path. Useful for taking screenshots of queries that need a lot of query string parameters, and static pages.

```
$ ddg-screen-diff path "?q=big+apple"
$ ddg-screen-diff path "bangs"
```

### search

```
Usage: ddg-screen-diff search <query> [<host|env> ...] [options]
```

Takes a screenshot against an arbitrary query.

```
$ ddg-screen-diff search "big apple"
```

(This is more or less the same as `ddg-screen-diff path "?q=big+apple"`.)

### ia

```
Usage: ddg-screen-diff ia <ia name> [--query <query>] [<host|env> ...] [options]
```

Takes a screenshot for an IA by name.

```
$ ddg-screen-diff ia products
```

By default this takes the example query from the IA metadata, so the above is equivalent to `ddg-screen-diff path "?q=ipad+2&ia=products`.

To check this IA against a different query, pass in the `-q`/`--query` argument:

```
$ ddg-screen-diff ia products --query "kitchen sink"
```

### group

```
Usage: ddg-screen-diff group <group name> [<host|env> ...] [options]
```

Take screenshot for a predefined list of commands. Useful for testing a template across several different IAs, etc. These are defined in JSON files. These are assumed to be in `groupDir`, which is specified in the config.

Here's the `example` group, defined in `example.json` in that folder:

```json
[
    { "command": "search", "commandValue": "kitchen sink" },
    { "command": "path", "commandValue": "?q=kitchen+sink&kz=-1" },
    { "command": "ia", "commandValue": "products", "query": "kitchen sink" }
]
```

Each of these lines is the same as a command line call using the tool. So the following are pretty much equivalent:

```
$ ddg-screen-diff group "example"

and

$ ddg-screen-diff search "kitchen sink"
$ ddg-screen-diff path "?q=kitchen+sink&kz=-1"
$ ddg-screen-diff ia products -q "kitchen sink"
```

The difference is that the former call will output the resulting screenshots and diffs on the same page.

A possible value for the `command` property is `group`, so you can call groups from a group - just be careful not to recurse!

#### Adding a new group

To create a new group, add a new JSON file in the `groupDir`.

Say you add `[groupDir]/attribution.json`. You can invoke this group by calling:

```
$ ddg-screen-diff group "attribution"
```

#### Using a script to build a group

In some cases, it might be useful to build a group based on a list that changes - say you've got a list of IAs that's constantly changing.

A script can be anything that:

- returns a JSON string that looks like a group JSON file above
- can be executed on the shell (so it needs `chmod +x` and a shebang)

For example, you could have a Perl script that creates a group for all the cheatsheets (this assumes you've got `DDG::Meta::Data` installed):

```perl
#!/usr/bin/env perl

use strict;
use warnings;
use DDG::Meta::Data;
use JSON;

my $meta = DDG::Meta::Data->by_id;

my @results;

while (my ($id, $data) = each $meta){
    next if $data->{perl_module} ne "DDG::Goodie::CheatSheets";
    next if $data->{dev_milestone} ne "live";

    my $result = {
        "command" => "ia",
        "commandValue" => $data->{id}
    };

    push(@results, $result);
}

print encode_json(\@results);
```

#### Options

All the options for the other screenshot commands work here. So, say you're on instance `foo`. Calling:

```
$ ddg-screen-diff group "example" foo bar -b firefox chrome -d
```

results in 12 screenshots in total with 6 diffs between them:

```
http://foo.duckduckgo.com/?q=kitchen+sink on firefox
http://bar.duckduckgo.com/?q=kitchen+sink on firefox
http://foo.duckduckgo.com/?q=kitchen+sink on chrome
http://bar.duckduckgo.com/?q=kitchen+sink on chrome
http://foo.duckduckgo.com/?q=kitchen+sink&kz=-1 on firefox
http://bar.duckduckgo.com/?q=kitchen+sink&kz=-1 on firefox
http://foo.duckduckgo.com/?q=kitchen+sink&kz=-1 on chrome
http://bar.duckduckgo.com/?q=kitchen+sink&kz=-1 on chrome
http://foo.duckduckgo.com/?q=kitchen+sink&ia=products on firefox
http://bar.duckduckgo.com/?q=kitchen+sink&ia=products on firefox
http://foo.duckduckgo.com/?q=kitchen+sink&ia=products on chrome
http://bar.duckduckgo.com/?q=kitchen+sink&ia=products on chrome
```

You can also specify a list of sizes and browsers to be run on a group item, as well as an action name. These override the settings passed via the CLI. So for example, given the following group called `override`:

```json
[
    {"command": "search", "commandValue": "kitchen sink", "browsers": ["ie8", "firefox"], "sizes": ["s"]},
    {"command": "search", "commandValue": "glass hammer"}
]
```

And the following call:

```
$ ddg-screen-diff group "override" -b chrome -s xl m
```

Will result in the following screenshots being taken:

```
http://foo.duckduckgo.com/?q=kitchen+sink on firefox at size s
http://foo.duckduckgo.com/?q=kitchen+sink on ie8 at size s
http://foo.duckduckgo.com/?q=glass+hammer on chrome at size xl
http://foo.duckduckgo.com/?q=glass+hammer on chrome at size m
```

Hostnames
---

By default, any of the search commands runs a search on the instance you're currently on. 

Passing a single hostname will run the tool against that hostname instead:

```
$ ddg-screen-diff ia products foo
```

You can specify a list of hostnames, and the tool will take a screenshot of each one:

```
$ ddg-screen-diff ia products foo bar baz qux
```

You can also pass in `-d`/`--diff` to run an image diff between two hosts.

Passing `prod` or `production` as a hostname will alias it to the production server.

### Ports

You can pass a subdomain with a port. So:

```
$ ddg-screen-diff search "kitchen sink" foo:5000
```

Will result in a screenshot URL of:

```
http://foo.duckduckgo.com:5000/?q=kitchen+sink
```

### Other domains

Any hostname you pass with a `.` will be assumed not to be a subdomain. Which means you can do:

```
$ ddg-screen-diff path "forum" duck.co
```

And you get a screenshot of:

```
http://duck.co/forum
```


Actions
---

With any screenshot command you can pass the `--action`/`-a` option to specify the name of an action to run before taking the screenshot. These are defined in a folder specified under `actionDir` in your config.

Here's an example action file called `click_button_and_mouse_out.json`:

```json
[
    { "action": "click", target: "#button_id" },
    { "action": "mouseMove", target: { x: 10, y: 10 }
]
```

You invoke that by running:

```
$ ddg-screen-diff search "foo" --action click_button_and_mouse_out
```

Currently supported values for `action` are `click`, `mouseMove`, `mouseUp` and `mouseDown`.

Currently supported values for `target` are a CSS selector string or an object with `x` and `y` coordinates.

Other options
---

### `-b`/`--browsers`

Pass in a list of browsers to run the query against. By default the query is run headlessly with PhantomJS.

Any other browsers are run on BrowserStack's service, so they'll run a bit more slowly.

If you've got an account with them, set your login credentials in the env variables `DDG_BROWSERSTACK_USERNAME` and `DDG_BROWSERSTACK_KEY`.

As an example, if you wanted to run the tool on IE8, phantomjs and Firefox, you can run:

```
$ ddg-screen-diff ia products -b ie8 phantomjs firefox
```

Passing `desktop` aliases to the latest versions of IE, Firefox, Chrome and Safari.

Passing `mobile` aliases to the latest (available) versions of the iOS and Android browsers.

Passing `all` aliases to all browsers in the `desktop` and `mobile` lists.

Type in `ddg-screen-diff search -h` to see a full list of the browsers supported.


### `-s`/`--sizes`

Pass one or more sizes to run the query against.

The available screen sizes are based on our breakpoints.

Type in `ddg-screen-diff search -h` to see a full list of the screen sizes supported. The default is "m", or 630x354 - which is just above our mobile breakpoint.

**Note:** this is only for desktop, for mobile browsers the screen size will depend on the device.

### `-l`/`--landscape`

Mobile/iOS only. Take the screenshot in landscape mode.

### `-m`/`--max-parallel-tasks`

How many screenshot tasks to run in parallel. Default is 2. If running against a third-party service, you may have a limit on how many tasks you can run at the same time.

### `-d`/`--diff`

Runs an image diff between the screenshots taken.

If you passed in two hosts, the diff is between those two.
If you passed in one host, the other one is assumed to be your local host.

In any other case, the app throws an error.

### `--qs`

Append an arbitrary query string to the one that ddg-screen-diff already builds. E.g. test the dark theme by doing:

```
$ ddg-screen-diff ia products --qs="kae=d"
```
