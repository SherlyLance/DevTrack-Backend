const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const Project = require('../models/Project');
const User = require('../models/User'); // Import User model for comment population
const auth = require('../middleware/auth');

// Create a new ticket
router.post('/', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.body.projectId);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user has access to the project
    if (!project.teamMembers.includes(req.user.id) && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Not a member of this project.' });
    }

    // Ensure reporter is set, default to current user if not provided
    const reporterId = req.body.reporter || req.user.id;
    const assigneeId = req.body.assignee || null; // Assignee can be optional

    // Validate assignee and reporter exist and are part of the project team if provided
    if (assigneeId) {
      const assigneeUser = await User.findById(assigneeId);
      if (!assigneeUser) {
        return res.status(404).json({ message: 'Assignee user not found.' });
      }
      if (!project.teamMembers.includes(assigneeId) && project.createdBy.toString() !== assigneeId) {
        return res.status(400).json({ message: 'Assignee must be a member of the project team.' });
      }
    }

    const reporterUser = await User.findById(reporterId);
    if (!reporterUser) {
        return res.status(404).json({ message: 'Reporter user not found.' });
    }
    if (!project.teamMembers.includes(reporterId) && project.createdBy.toString() !== reporterId) {
        return res.status(400).json({ message: 'Reporter must be a member of the project team.' });
    }


    const ticket = new Ticket({
      title: req.body.title,
      description: req.body.description,
      priority: req.body.priority,
      status: req.body.status,
      type: req.body.type, // Added type
      tags: req.body.tags, // Added tags
      assignee: assigneeId,
      reporter: reporterId, // Set reporter
      projectId: req.body.projectId,
      createdBy: req.user.id, // Creator is the authenticated user
      dueDate: req.body.dueDate || null, // Added dueDate
    });
    await ticket.save();

    // Populate fields before sending response
    await ticket.populate('assignee', 'name email');
    await ticket.populate('reporter', 'name email');
    await ticket.populate('createdBy', 'name email');

    res.status(201).json(ticket);
  } catch (err) {
    console.error('Error creating ticket:', err);
    res.status(400).json({ message: err.message });
  }
});

// GET all tickets accessible by the authenticated user
// This will fetch tickets from projects the user is a member of or created.
router.get('/', auth, async (req, res) => {
  try {
    // Find projects where the user is a member or creator
    const projects = await Project.find({
      $or: [
        { createdBy: req.user.id },
        { teamMembers: req.user.id }
      ]
    }).select('_id'); // Only need project IDs

    const projectIds = projects.map(p => p._id);

    // Find tickets associated with these projects
    const tickets = await Ticket.find({ projectId: { $in: projectIds } })
      .populate('assignee', 'name email')
      .populate('reporter', 'name email') // Populate reporter
      .populate('createdBy', 'name email')
      .populate('projectId', 'title'); // Populate project title for easier display

    res.json(tickets);
  } catch (err) {
    console.error('Error fetching all tickets:', err);
    res.status(500).json({ message: err.message });
  }
});


// Get all tickets for a specific project
// This route is already good, but ensures populating reporter and comments
router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user has access to the project
    if (!project.teamMembers.includes(req.user.id) && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Not a member of this project.' });
    }

    const tickets = await Ticket.find({ projectId: req.params.projectId })
      .populate('assignee', 'name email')
      .populate('reporter', 'name email') // Populate reporter
      .populate('createdBy', 'name email')
      .populate('comments.author', 'name email'); // Populate author of comments
    res.json(tickets);
  } catch (err) {
    console.error('Error fetching project tickets:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get a specific ticket
// Ensures populating reporter and comments
router.get('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('assignee', 'name email')
      .populate('reporter', 'name email') // Populate reporter
      .populate('createdBy', 'name email')
      .populate('comments.author', 'name email'); // Populate author of comments

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const project = await Project.findById(ticket.projectId);

    // Check if user has access to the project
    if (!project.teamMembers.includes(req.user.id) && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Not a member of this project.' });
    }

    res.json(ticket);
  } catch (err) {
    console.error('Error fetching single ticket:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update a ticket
router.put('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const project = await Project.findById(ticket.projectId);

    // Check if user has access to the project
    if (!project.teamMembers.includes(req.user.id) && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Not a member of this project.' });
    }

    // Optional: Validate assignee and reporter if they are being updated
    if (req.body.assignee) {
      const assigneeUser = await User.findById(req.body.assignee);
      if (!assigneeUser) return res.status(404).json({ message: 'Assignee user not found.' });
      if (!project.teamMembers.includes(req.body.assignee) && project.createdBy.toString() !== req.body.assignee) {
        return res.status(400).json({ message: 'Assignee must be a member of the project team.' });
      }
    }
    if (req.body.reporter) {
        const reporterUser = await User.findById(req.body.reporter);
        if (!reporterUser) return res.status(404).json({ message: 'Reporter user not found.' });
        if (!project.teamMembers.includes(req.body.reporter) && project.createdBy.toString() !== req.body.reporter) {
            return res.status(400).json({ message: 'Reporter must be a member of the project team.' });
        }
    }


    Object.assign(ticket, req.body);
    await ticket.save();

    // Populate fields before sending response
    await ticket.populate('assignee', 'name email');
    await ticket.populate('reporter', 'name email');
    await ticket.populate('createdBy', 'name email');
    await ticket.populate('comments.author', 'name email');

    res.json(ticket);
  } catch (err) {
    console.error('Error updating ticket:', err);
    res.status(400).json({ message: err.message });
  }
});

// Delete a ticket
router.delete('/:id', auth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const project = await Project.findById(ticket.projectId);

    // Only project creator or ticket creator can delete
    if (project.createdBy.toString() !== req.user.id && ticket.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: You must be the project creator or ticket creator to delete this ticket.' });
    }

    await ticket.deleteOne(); // Use deleteOne() instead of remove() for Mongoose 6+
    res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    console.error('Error deleting ticket:', err);
    res.status(500).json({ message: err.message });
  }
});

// Assign ticket (This route is redundant now, as update ticket can handle it)
// I'm keeping it for now, but you might consider removing it and using PUT /:id
router.put('/:id/assign', auth, async (req, res) => {
  try {
    const { assigneeId } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const project = await Project.findById(ticket.projectId);

    // Check if user has access to the project
    if (!project.teamMembers.includes(req.user.id) && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Not a member of this project.' });
    }

    // Check if assignee is a project member
    if (!project.teamMembers.includes(assigneeId) && project.createdBy.toString() !== assigneeId) {
      return res.status(400).json({ message: 'Assignee must be a project member.' });
    }

    ticket.assignee = assigneeId;
    await ticket.save();

    // Populate assignee before sending response
    await ticket.populate('assignee', 'name email');
    res.json(ticket);
  } catch (err) {
    console.error('Error assigning ticket:', err);
    res.status(400).json({ message: err.message });
  }
});

// Add a comment to a ticket
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { text } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const project = await Project.findById(ticket.projectId);

    // Check if user has access to the project to comment
    if (!project.teamMembers.includes(req.user.id) && project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Not a member of this project.' });
    }

    const newComment = {
      author: req.user.id,
      text: text,
      timestamp: new Date()
    };

    ticket.comments.push(newComment);
    await ticket.save();

    // Populate the newly added comment's author before sending response
    // Find the last added comment (which is the new one) and populate its author
    const populatedTicket = await Ticket.findById(ticket._id)
      .populate('comments.author', 'name email'); // Populate all comment authors

    const latestComment = populatedTicket.comments[populatedTicket.comments.length - 1];

    res.status(201).json(latestComment); // Return only the new comment
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(400).json({ message: err.message });
  }
});


module.exports = router;
