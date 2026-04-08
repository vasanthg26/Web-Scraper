# Scrape of https://docs.oracle.com/cd/E24150_01/pt851h2/eng/psbooks/tpcd/chapter.htm?File=tpcd/htm/tpcd02.htm



--- Page 1 ---
Source: https://docs.oracle.com/cd/E24150_01/pt851h2/eng/psbooks/tpcd/chapter.htm?File=tpcd/htm/tpcd02.htm


Getting Started with PeopleCode
PeopleCode is the proprietary language used by PeopleSoft applications.
This chapter provides an overview of PeopleCode and discusses how to create
PeopleCode programs.
This chapter provides information to consider before you begin to use
PeopleCode. In addition to the considerations presented in this section, you
should take advantage of all PeopleSoft sources of information, including
the installation guides, release notes, and PeopleBooks.


![Click to jump to parent topic](../../img/previous.gif)

PeopleCode Overview 
This section provides an overview of the conceptual information available
about the PeopleCode language. The reference material, that is, the actual
descriptions of the functions, methods and properties can be found in the
following:
PeopleTools 8.51 PeopleBook: PeopleCode Language
Reference
This book contains information about PeopleCode built-in functions,
meta-SQL, system variables, and meta-HTML.

PeopleTools 8.51 PeopleBook: PeopleCode API
Reference
This book contains information about all the classes delivered with
Oracle's PeopleTools, as well as specifics about each class's methods and
properties.


PeopleCode resembles other programming languages. However, many aspects
are unique to the language and the PeopleTools environment. To learn more
about the language, see Understanding the PeopleCode Language.
See Understanding the PeopleCode Language.
PeopleCode is an object-oriented language. To learn about objects and
how they're used in PeopleCode, see Understanding Objects and Classes in PeopleCode. 
See Understanding Objects and Classes in PeopleCode.
The component
buffer is the area in memory that stores data for the currently active component.
Which fields are loaded into the component buffer, as well as how to access
them, is covered in Referencing Data in the Component Buffer.
See Referencing Data in the Component Buffer.
The
system uses a data buffer as well as the component buffer. The data buffer
is used to store data added from sources other than the component, such as
from a Application Engine program, an application message, and so on. For
information about this buffer, see Accessing the Data Buffer.
See Accessing the Data Buffer.
All PeopleCode is associated with a definition and an event. The events
run in a particular order from the Component Processor. To learn more about
the Component Processor and the standard event set, see PeopleCode and the
Component Processor.
See PeopleCode and the Component Processor.
You should take into account certain considerations when creating applications
to be used in the PeopleSoft Pure Internet Architecture. These include how
to make your code more efficient when running on the internet, as well as
considerations when using specific definitions. 
See PeopleCode and PeopleSoft Pure Internet Architecture.
There are restrictions on using some of the functions and methods in
the PeopleCode language, as well as considerations for others, like using
standalone rowsets and the OLE functions. These are covered in the Using Methods
and Built-in Functions chapter.
See Using Methods and Built-In Functions.
PeopleCode has a tremendous amount of specialized functionality, such
as:
Using the GenerateTree function to create a tree in your
application.

Viewing, adding, and deleting files.


See Using the GenerateTree Function.
See Working With File Attachments.


![Click to jump to parent topic](../../img/previous.gif)

Creating PeopleCode Programs          
All PeopleCode programs are associated with a definition as well as
an event. To learn more about where you can place your PeopleCode, and have
it executed as part of the Component Processor event flow, see Accessing PeopleCode
and Events.
See Accessing PeopleCode and Events.
Use the PeopleCode editor to create your PeopleCode programs. All the
functionality of the PeopleCode editor is described in Using the PeopleCode
Editor. 
See Using the PeopleCode Editor.
Every PeopleCode program is associated with a definition. The following
definitions have additional functionality associated with the PeopleCode editor:
SQL definitions

Application Package definitions


See Using the SQL Editor.
See Creating Application Packages and Classes.
After you have created your program, you must run it. Often, that involves
fixing any errors that you find. The PeopleCode debugger is an integrated
part of PeopleSoft Application Designer, and it has many useful tools for
determining where code errors are occurring. All the functionality is described
in Debugging your Application. 
See Debugging Your Application.
After your PeopleCode program is running, you may want to either improve
its performance or the user experience. Techniques for doing this are discussed
in Improving Your PeopleCode. 
See Improving Your PeopleCode.




Enterprise PeopleTools 8.51 PeopleBook: PeopleCode Developer's Guide
Copyright © 1988, 2011, Oracle and/or its affiliates. All rights reserved.




--------------------------------------------------
