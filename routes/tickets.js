const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const Project = require('../models/Project');
const User = require('../models/User'); // Import User model for validation and comment population
const auth = require('../middleware/auth'); // Middleware for authentication

/**
 * @route POST /api/tickets
 * @desc Create a new ticket
 * @access Private
 */
router.post('/', auth, async (req, res) => {
  try {
    const { projectId, title, description, priority, status, type, tags, assignee, reporter, dueDate } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found for this ticket.' });
    }

    // Check if the authenticated user has access to create a ticket in this project
    // User must be either the project creator or a team member
    const isCreator = project.createdBy.toString() === req.user.id;
    const isTeamMember = project.teamMembers.includes(req.user.id);

    if (!isCreator && !isTeamMember) {
      return res.status(403).json({ message: 'Access denied: You are not authorized to create tickets in this project.' });
    }

    // Determine reporter: default to current user if not provided
    const reporterId = reporter || req.user.id;
    const assigneeId = assignee || null; // Assignee can be optional

    // Validate assignee and reporter exist and are part of the project team if provided
    if (assigneeId) {
      const assigneeUser = await User.findById(assigneeId);
      if (!assigneeUser) {
        return res.status(404).json({ message: 'Assignee user not found.' });
      }
      // Assignee must be a project team member or the project creator
      if (!project.teamMembers.includes(assigneeId) && project.createdBy.toString() !== assigneeId) {
        return res.status(400).json({ message: 'Assignee must be a member of the project team.' });
      }
    }

    const reporterUser = await User.findById(reporterId);
    if (!reporterUser) {
      return res.status(404).json({ message: 'Reporter user not found.' });
    }
    // Reporter must be a project team member or the project creator
    if (!project.teamMembers.includes(reporterId) && project.createdBy.toString() !== reporterId) {
      return res.status(400).json({ message: 'Reporter must be a member of the project team.' });
    }

    const ticket = new Ticket({
      title,
      description,
      priority,
      status,
      type,
      tags,
      assignee: assigneeId,
      reporter: reporterId,
      projectId,
      createdBy: req.user.id, // The authenticated user is the one who created this ticket entry
      dueDate: dueDate || null,
    });

    await ticket.save();

    // Populate fields for the response
    await ticket.populate('assignee', 'name email');
    await ticket.populate('reporter', 'name email');
    await ticket.populate('createdBy', 'name email');
    await ticket.populate('projectId', 'title'); // Populate project title

    res.status(201).json(ticket);
  } catch (err) {
    console.error('Error creating ticket:', err.message);
    res.status(400).json({ message: err.message });
  }
});

/**
 * @route GET /api/tickets
 * @desc Get all tickets accessible by the authenticated user
 * (tickets from projects the user is a member of or created)
 * @access Private
 */
router.get('/', auth, async (req, res) => {
  try {
    // Find all projects where the user is a member or the creator
    const projects = await Project.find({
      $or: [
        { createdBy: req.user.id },
        { teamMembers: req.user.id }
      ]
    }).select('_id'); // Only retrieve project IDs

    const projectIds = projects.map(p => p._id);

    // Find tickets associated with these accessible projects
    const tickets = await Ticket.find({ projectId: { $in: projectIds } })
      .populate('assignee', 'name email')
      .populate('reporter', 'name email')
      .populate('createdBy', 'name email')
      .populate('projectId', 'title'); // Populate project title for context

    res.json(tickets);
  } catch (err) {
    console.error('Error fetching all tickets:', err.message);
    res.status(500).json({ message: 'Server error. Could not fetch tickets.' });
  }
});

/**
 * @route GET /api/tickets/project/:projectId
 * @desc Get all tickets for a specific project
 * @access Private
 */
router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // Check if the authenticated user has access to this project
    const isCreator = project.createdBy.toString() === req.user.id;
    const isTeamMember = project.teamMembers.includes(req.user.id);

    if (!isCreator && !isTeamMember) {
      return res.status(403).json({ message: 'Access denied: You are not authorized to view tickets in this project.' });
    }

    // Find tickets belonging to the specified project
    const tickets = await Ticket.find({ projectId: req.params.projectId })
      .populate('assignee', 'name email')
      .populate('reporter', 'name email')
      .populate('createdBy', 'name email')
      .populate('comments.author', 'name email'); // Populate author of comments

    res.json(tickets);
  } catch (err) {
    console.error('Error fetching project tickets:', err.message);
    res.status(500).json({ message: 'Server error. Could not fetch project tickets.' });
  }
});

/**
 * @route GET /api/tickets/:id
 * @desc Get a specific ticket by ID
 * @access Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('assignee', 'name email')
      .populate('reporter', 'name email')
      .populate('createdBy', 'name email')
      .populate('comments.author', 'name email') // Populate author of comments
      .populate('projectId', 'title'); // Populate project title for context

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found.' });
    }

    const project = await Project.findById(ticket.projectId);

    // Check if the authenticated user has access to the project this ticket belongs to
    const isCreator = project.createdBy.toString() === req.user.id;
    const isTeamMember = project.teamMembers.includes(req.user.id);

    if (!isCreator && !isTeamMember) {
      return res.status(403).json({ message: 'Access denied: You are not authorized to view this ticket.' });
    }

    res.json(ticket);
  } catch (err) {
    console.error('Error fetching single ticket:', err.message);
    res.status(500).json({ message: 'Server error. Could not fetch ticket details.' });
  }
});

/**
 * @route PUT /api/tickets/:id
 * @desc Update a ticket by ID
 * @access Private
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found.' });
    }

    const project = await Project.findById(ticket.projectId);
    if (!project) {
      // This case should ideally not happen if ticket.projectId is valid
      return res.status(404).json({ message: 'Associated project not found for this ticket.' });
    }

    // Check if the authenticated user has access to update this ticket
    const isProjectCreator = project.createdBy.toString() === req.user.id;
    const isProjectTeamMember = project.teamMembers.includes(req.user.id);
    const isTicketCreator = ticket.createdBy.toString() === req.user.id;

    // Allow update if user is project creator, project team member, or ticket creator
    if (!isProjectCreator && !isProjectTeamMember && !isTicketCreator) {
      return res.status(403).json({ message: 'Access denied: You are not authorized to update this ticket.' });
    }

    // Validate assignee if it's being updated
    if (req.body.assignee) {
      const assigneeUser = await User.findById(req.body.assignee);
      if (!assigneeUser) {
        return res.status(404).json({ message: 'Assignee user not found.' });
      }
      if (!project.teamMembers.includes(req.body.assignee) && project.createdBy.toString() !== req.body.assignee) {
        return res.status(400).json({ message: 'Assignee must be a member of the project team.' });
      }
    }
    // Validate reporter if it's being updated
    if (req.body.reporter) {
      const reporterUser = await User.findById(req.body.reporter);
      if (!reporterUser) {
        return res.status(404).json({ message: 'Reporter user not found.' });
      }
      if (!project.teamMembers.includes(req.body.reporter) && project.createdBy.toString() !== req.body.reporter) {
        return res.status(400).json({ message: 'Reporter must be a member of the project team.' });
      }
    }

    // Update ticket fields from request body
    Object.assign(ticket, req.body);
    await ticket.save();

    // Populate fields for the response
    await ticket.populate('assignee', 'name email');
    await ticket.populate('reporter', 'name email');
    await ticket.populate('createdBy', 'name email');
    await ticket.populate('comments.author', 'name email');
    await ticket.populate('projectId', 'title');

    res.json(ticket);
  } catch (err) {
    console.error('Error updating ticket:', err.message);
    res.status(400).json({ message: err.message });
  }
});

/**
 * @route DELETE /api/tickets/:id
 * @desc Delete a ticket by ID
 * @access Private (only project creator or ticket creator can delete)
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found.' });
    }

    const project = await Project.findById(ticket.projectId);
    if (!project) {
      return res.status(404).json({ message: 'Associated project not found for this ticket.' });
    }

    // Only project creator or the ticket's creator can delete the ticket
    const isProjectCreator = project.createdBy.toString() === req.user.id;
    const isTicketCreator = ticket.createdBy.toString() === req.user.id;

    if (!isProjectCreator && !isTicketCreator) {
      return res.status(403).json({ message: 'Access denied: You must be the project creator or ticket creator to delete this ticket.' });
    }

    // Use deleteOne() for Mongoose 6+ to remove the document
    await ticket.deleteOne();
    res.json({ message: 'Ticket deleted successfully.' });
  } catch (err) {
    console.error('Error deleting ticket:', err.message);
    res.status(500).json({ message: 'Server error. Could not delete ticket.' });
  }
});

/**
 * @route POST /api/tickets/:id/comments
 * @desc Add a comment to a ticket
 * @access Private
 */
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { text } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found.' });
    }

    const project = await Project.findById(ticket.projectId);
    if (!project) {
      return res.status(404).json({ message: 'Associated project not found for this ticket.' });
    }

    // Check if the authenticated user has access to comment on this ticket
    // User must be a project team member or the project creator
    const isProjectCreator = project.createdBy.toString() === req.user.id;
    const isProjectTeamMember = project.teamMembers.includes(req.user.id);

    if (!isProjectCreator && !isProjectTeamMember) {
      return res.status(403).json({ message: 'Access denied: You are not authorized to comment on this ticket.' });
    }

    const newComment = {
      author: req.user.id, // The authenticated user is the author of the comment
      text: text,
      timestamp: new Date()
    };

    ticket.comments.push(newComment);
    await ticket.save();

    // To return the populated new comment, we need to re-fetch or carefully populate
    // the specific new comment. A simpler approach is to re-fetch the ticket
    // and extract the last comment, or just return the newComment object
    // and let the frontend update its state. For now, we'll populate and return the latest.
    const populatedTicket = await Ticket.findById(ticket._id)
      .populate('comments.author', 'name email'); // Populate all comment authors

    const latestComment = populatedTicket.comments[populatedTicket.comments.length - 1];

    res.status(201).json(latestComment); // Return only the newly added comment
  } catch (err) {
    console.error('Error adding comment:', err.message);
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
